type ProfileRecord = {
  id?: string;
  email?: string;
  display_name?: string | null;
  organization?: string | null;
  status?: string;
  role?: string;
  created_at?: string;
};

type DatabaseWebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: ProfileRecord | null;
  old_record?: ProfileRecord | null;
};

const resendEndpoint = "https://api.resend.com/emails";

function env(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
}

function isAuthorized(req: Request): boolean {
  const secret = env("WEBHOOK_SECRET");
  if (!secret) return true;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerSecret = req.headers.get("x-webhook-secret");
  return bearer === secret || headerSecret === secret;
}

function adminUrl(record: ProfileRecord): string {
  const configured = env("APPROVAL_ADMIN_URL");
  if (configured) return configured;

  const siteUrl = env("SITE_URL") ?? env("NEXT_PUBLIC_SITE_URL");
  if (siteUrl) return `${siteUrl.replace(/\/$/, "")}/prototype/admin/`;

  return "Open the Field lab admin page to approve or reject this user.";
}

function textBody(record: ProfileRecord): string {
  const lines = [
    "A new WeedWatch Field lab user is pending admin approval.",
    "",
    `Email: ${record.email ?? "(missing)"}`,
    `Name: ${record.display_name ?? "(not provided)"}`,
    `Organization: ${record.organization ?? "(not provided)"}`,
    `User ID: ${record.id ?? "(missing)"}`,
    `Created: ${record.created_at ?? "(unknown)"}`,
    "",
    `Review: ${adminUrl(record)}`,
  ];
  return lines.join("\n");
}

function htmlBody(record: ProfileRecord): string {
  const review = adminUrl(record);
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#102010">
      <h2>New Field lab approval pending</h2>
      <p>A new WeedWatch Field lab user is waiting for admin approval.</p>
      <table style="border-collapse:collapse">
        <tr><td><strong>Email</strong></td><td>${escape(record.email ?? "(missing)")}</td></tr>
        <tr><td><strong>Name</strong></td><td>${escape(record.display_name ?? "(not provided)")}</td></tr>
        <tr><td><strong>Organization</strong></td><td>${escape(record.organization ?? "(not provided)")}</td></tr>
        <tr><td><strong>User ID</strong></td><td><code>${escape(record.id ?? "(missing)")}</code></td></tr>
        <tr><td><strong>Created</strong></td><td>${escape(record.created_at ?? "(unknown)")}</td></tr>
      </table>
      ${
        review.startsWith("http")
          ? `<p><a href="${escape(review)}">Open Field lab admin</a></p>`
          : `<p>${escape(review)}</p>`
      }
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  const resendApiKey = env("RESEND_API_KEY");
  const to = env("APPROVAL_NOTIFY_TO");
  const from = env("APPROVAL_NOTIFY_FROM") ?? "WeedWatch <onboarding@resend.dev>";
  const replyTo = env("APPROVAL_NOTIFY_REPLY_TO");

  if (!resendApiKey || !to) {
    return jsonResponse(
      { error: "Missing RESEND_API_KEY or APPROVAL_NOTIFY_TO" },
      { status: 500 },
    );
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, { status: 400 });
  }

  const record = payload.record;
  const isPendingProfileInsert =
    payload.type === "INSERT" &&
    payload.schema === "public" &&
    payload.table === "profiles" &&
    record?.status === "pending";

  if (!isPendingProfileInsert) {
    return jsonResponse({ ok: true, skipped: true });
  }

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: to.split(",").map((email) => email.trim()).filter(Boolean),
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: `WeedWatch approval pending: ${record.email ?? "new user"}`,
      text: textBody(record),
      html: htmlBody(record),
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("[notify-pending-approval] resend failed", body);
    return jsonResponse(
      { error: "Email send failed", provider: body },
      { status: 502 },
    );
  }

  return jsonResponse({ ok: true, provider: body });
});
