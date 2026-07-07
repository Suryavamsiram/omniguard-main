import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Supported SSO providers
const PROVIDERS: Record<string, {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}> = {
  okta: {
    authUrl: (domain: string) => `https://${domain}/oauth2/v1/authorize`,
    tokenUrl: (domain: string) => `https://${domain}/oauth2/v1/token`,
    userInfoUrl: (domain: string) => `https://${domain}/oauth2/v1/userinfo`,
    scopes: ["openid", "profile", "email", "groups"],
  },
  entra: {
    authUrl: (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    userInfoUrl: () => "https://graph.microsoft.com/v1.0/me",
    scopes: ["openid", "profile", "email", "User.Read"],
  },
  google: {
    authUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    userInfoUrl: () => "https://openidconnect.googleapis.com/v1/userinfo",
    scopes: ["openid", "profile", "email"],
  },
  github: {
    authUrl: () => "https://github.com/login/oauth/authorize",
    tokenUrl: () => "https://github.com/login/oauth/access_token",
    userInfoUrl: () => "https://api.github.com/user",
    scopes: ["read:user", "user:email"],
  },
};

function generateState(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { verifier, challenge };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/sso-auth/, "");

  try {
    // GET /providers - list available SSO providers
    if (req.method === "GET" && path === "/providers") {
      const { data: orgIntegrations } = await supabase
        .from("integrations")
        .select("provider, config, status")
        .eq("provider", "sso_%")
        .eq("status", "active");

      const providers = Object.keys(PROVIDERS).map(p => ({
        id: p,
        name: p.charAt(0).toUpperCase() + p.slice(1),
        configured: orgIntegrations?.some(i => i.provider === `sso_${p}`) || false,
      }));

      return json({ success: true, providers });
    }

    // POST /authorize - start SSO flow
    if (req.method === "POST" && path === "/authorize") {
      const { provider, redirect_uri, organization_id } = await req.json();

      if (!provider || !redirect_uri) {
        return json({ success: false, error: "Missing provider or redirect_uri" }, 400);
      }

      const providerConfig = PROVIDERS[provider];
      if (!providerConfig) {
        return json({ success: false, error: "Unknown provider" }, 400);
      }

      // Get provider configuration from integrations
      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("organization_id", organization_id)
        .eq("provider", `sso_${provider}`)
        .eq("status", "active")
        .maybeSingle();

      const config = integration?.config as Record<string, string> || {};
      const clientId = config.client_id;
      const domain = config.domain || config.tenant_id || "";

      if (!clientId) {
        return json({ success: false, error: "Provider not configured" }, 400);
      }

      const state = generateState();
      const { verifier, challenge } = await generatePKCE();

      // Store state for verification
      await supabase.from("sso_states").insert({
        state,
        code_verifier: verifier,
        provider,
        redirect_uri,
        organization_id,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const authUrl = providerConfig.authUrl(domain);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${Deno.env.get("SUPABASE_URL")?.replace("/rest/v1", "")}/functions/v1/sso-auth/callback`,
        response_type: "code",
        scope: providerConfig.scopes.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      return json({
        success: true,
        authorization_url: `${authUrl}?${params.toString()}`,
        state,
      });
    }

    // GET /callback - handle OAuth callback
    if (req.method === "GET" && path === "/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            Location: `${url.searchParams.get("redirect_uri") || "/"}?error=${error}`,
          },
        });
      }

      if (!code || !state) {
        return new Response("Missing code or state", { status: 400 });
      }

      // Retrieve stored state
      const { data: stateData } = await supabase
        .from("sso_states")
        .select("*")
        .eq("state", state)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!stateData) {
        return new Response("Invalid or expired state", { status: 400 });
      }

      // Delete used state
      await supabase.from("sso_states").delete().eq("state", state);

      const { provider, code_verifier, redirect_uri, organization_id } = stateData;

      // Get provider config
      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("organization_id", organization_id)
        .eq("provider", `sso_${provider}`)
        .maybeSingle();

      const config = integration?.config as Record<string, string> || {};
      const clientId = config.client_id;
      const clientSecret = config.client_secret;
      const domain = config.domain || config.tenant_id || "";

      const providerConfig = PROVIDERS[provider];
      if (!providerConfig) {
        return new Response("Unknown provider", { status: 400 });
      }

      // Exchange code for tokens
      const tokenResponse = await fetch(providerConfig.tokenUrl(domain), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: `${Deno.env.get("SUPABASE_URL")?.replace("/rest/v1", "")}/functions/v1/sso-auth/callback`,
          client_id: clientId,
          client_secret: clientSecret,
          code_verifier: code_verifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const err = await tokenResponse.text();
        console.error("Token exchange failed:", err);
        return new Response("Token exchange failed", { status: 500 });
      }

      const tokens = await tokenResponse.json();
      const accessToken = tokens.access_token;

      // Fetch user info
      const userInfoUrl = provider === "github"
        ? providerConfig.userInfoUrl()
        : providerConfig.userInfoUrl(domain);

      const userInfoHeaders: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      };

      if (provider === "github") {
        userInfoHeaders.Accept = "application/vnd.github.v3+json";
      }

      const userResponse = await fetch(userInfoUrl, { headers: userInfoHeaders });
      if (!userResponse.ok) {
        return new Response("User info fetch failed", { status: 500 });
      }

      const userInfo = await userResponse.json();

      // Normalize user info
      const email = userInfo.email || userInfo.mail || userInfo.preferred_username || "";
      const name = userInfo.name || userInfo.displayName || `${userInfo.given_name || ""} ${userInfo.family_name || ""}`.trim();
      const externalId = userInfo.sub || userInfo.id || userInfo.login || "";

      // Check if user exists by email
      let { data: existingUser } = await supabase.auth.admin.listUsers({ email });

      let userId: string;

      if (existingUser.users.length > 0) {
        userId = existingUser.users[0].id;

        // Update user metadata if needed
        await supabase.auth.admin.updateUser(userId, {
          user_metadata: {
            full_name: name,
            sso_provider: provider,
            sso_id: externalId,
          },
        });
      } else {
        // Create user (JIT provisioning)
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: name,
            sso_provider: provider,
            sso_id: externalId,
          },
        });

        if (createError) {
          console.error("User creation failed:", createError);
          return new Response("User creation failed", { status: 500 });
        }

        userId = newUser.id;
      }

      // Ensure membership in organization
      const { data: existingMembership } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingMembership) {
        await supabase.from("organization_members").insert({
          organization_id: organization_id,
          user_id: userId,
          role: config.default_role || "member",
          status: "active",
          joined_at: new Date().toISOString(),
        });
      }

      // Generate Supabase session token
      const { data: sessionToken } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      // Redirect back to app with session
      const sessionUrl = new URL(redirect_uri);
      sessionUrl.searchParams.set("token", sessionToken?.properties?.action_link || "");
      sessionUrl.searchParams.set("type", "sso");
      sessionUrl.searchParams.set("provider", provider);

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: sessionUrl.toString() },
      });
    }

    // POST /device/start - Start device flow (for CLI)
    if (req.method === "POST" && path === "/device/start") {
      const { provider, organization_id } = await req.json();

      // Only Okta and Auth0 support device flow
      if (provider !== "okta" && provider !== "auth0") {
        return json({ success: false, error: "Device flow not supported for this provider" }, 400);
      }

      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("organization_id", organization_id)
        .eq("provider", `sso_${provider}`)
        .maybeSingle();

      const config = integration?.config as Record<string, string> || {};
      const clientId = config.client_id;
      const domain = config.domain || "";

      const deviceUrl = provider === "okta"
        ? `https://${domain}/oauth2/v1/device/authorize`
        : `https://${domain}/oauth/device/code`;

      const response = await fetch(deviceUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          scope: "openid profile email",
        }).toString(),
      });

      if (!response.ok) {
        const err = await response.text();
        return json({ success: false, error: err }, 400);
      }

      const data = await response.json();

      // Store device code for polling
      await supabase.from("sso_device_flows").insert({
        device_code: data.device_code,
        user_code: data.user_code,
        provider,
        organization_id,
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        interval: data.interval || 5,
      });

      return json({
        success: true,
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri_complete || data.verification_uri,
        expires_in: data.expires_in,
        interval: data.interval || 5,
      });
    }

    // POST /device/poll - Poll for device authorization completion
    if (req.method === "POST" && path === "/device/poll") {
      const { device_code, organization_id } = await req.json();

      const { data: flowData } = await supabase
        .from("sso_device_flows")
        .select("*")
        .eq("device_code", device_code)
        .maybeSingle();

      if (!flowData) {
        return json({ success: false, error: "Invalid device code" }, 400);
      }

      const { provider } = flowData;
      const config = (await supabase
        .from("integrations")
        .select("config")
        .eq("organization_id", organization_id)
        .eq("provider", `sso_${provider}`)
        .maybeSingle()).data?.config as Record<string, string> || {};

      const domain = config.domain || "";
      const tokenUrl = provider === "okta"
        ? `https://${domain}/oauth2/v1/token`
        : `https://${domain}/oauth/token`;

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: config.client_id,
          device_code,
        }).toString(),
      });

      if (response.status === 400) {
        const data = await response.json();
        if (data.error === "authorization_pending") {
          return json({ success: false, pending: true });
        }
        return json({ success: false, error: data.error }, 400);
      }

      if (!response.ok) {
        return json({ success: false, error: "Token request failed" }, 400);
      }

      // Complete - clean up flow
      await supabase.from("sso_device_flows").delete().eq("device_code", device_code);

      const tokens = await response.json();
      return json({
        success: true,
        access_token: tokens.access_token,
        id_token: tokens.id_token,
      });
    }

    return json({ success: false, error: "Not found" }, 404);
  } catch (err) {
    console.error("sso-auth error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
