/* S2 · the brief handler.
 *
 * The site itself is static (GitHub Pages serves dist/), so this is the one piece that
 * needs somewhere to run: any Node host that can reach the myriadflow.com mail account
 * over SMTP. Point the contact form at it by setting `data-endpoint` on #briefForm in
 * contact/index.html to this handler's URL.
 *
 *   cd server && npm install && node brief.mjs
 *
 * Configuration, all through the environment:
 *   SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS   the myriadflow.com mail account
 *   MAIL_TO      where briefs land          (default contact@myriadflow.com)
 *   MAIL_FROM    the envelope sender        (default SMTP_USER)
 *   ORIGIN       the site allowed to post   (default https://myriadflow.com)
 *   PORT         (8080)
 *
 * Never commit the credentials; set them on the host.
 */

import { createServer } from "node:http";
import Busboy from "busboy";
import nodemailer from "nodemailer";

const PORT = Number(process.env.PORT || 8080);
const ORIGIN = process.env.ORIGIN || "https://myriadflow.com";
const MAIL_TO = process.env.MAIL_TO || "contact@myriadflow.com";
const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER;

const MAX_FILE = 20 * 1024 * 1024; // the form promises about 20 MB
const MAX_FIELD = 8 * 1024;
const WINDOW = 10 * 60 * 1000; // ten minutes
const PER_WINDOW = 3; // briefs per address in that window

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

/* A plain in-memory rate limit: enough for one instance, and it forgets on restart. */
const seen = new Map();
function tooMany(ip) {
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter((t) => now - t < WINDOW);
  hits.push(now);
  seen.set(ip, hits);
  if (seen.size > 5000)
    for (const [k, v] of seen) if (now - v.at(-1) > WINDOW) seen.delete(k);
  return hits.length > PER_WINDOW;
}

/* Reads one multipart body into { fields, file }. Rejects anything oversized. */
function readForm(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: MAX_FILE,
        fieldSize: MAX_FIELD,
        fields: 12,
      },
    });
    const fields = {};
    let file = null;
    let failed = null;

    bb.on("field", (name, value) => (fields[name] = value));
    bb.on("file", (_name, stream, info) => {
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("limit", () => (failed = "file too large"));
      stream.on("end", () => {
        if (!failed && chunks.length) {
          file = {
            filename: info.filename,
            contentType: info.mimeType,
            content: Buffer.concat(chunks),
          };
        }
      });
    });
    bb.on("error", reject);
    bb.on("close", () =>
      failed ? reject(new Error(failed)) : resolve({ fields, file }),
    );
    req.pipe(bb);
  });
}

const looksLikeEmail = (s) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const oneLine = (s) =>
  String(s || "")
    .replace(/[\r\n]+/g, " ")
    .trim();

const server = createServer(async (req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  const end = (code, body) => {
    res.writeHead(code, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "OPTIONS") return end(204, {});
  if (req.method !== "POST") return end(405, { error: "POST only" });

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress;

  try {
    const { fields, file } = await readForm(req);

    /* the honeypot: people leave it empty, bots fill it in. Answer 200 so they stop trying. */
    if (fields.company) return end(200, { ok: true });

    const idea = String(fields.prompt || "").trim();
    const email = String(fields.email || "").trim();
    if (!idea || !looksLikeEmail(email))
      return end(400, { error: "idea and a valid email are required" });
    if (tooMany(ip))
      return end(429, { error: "too many briefs from here just now" });

    const words = idea.split(/\s+/).slice(0, 6).join(" ");
    const lines = [
      idea,
      "",
      `What they have: ${fields.have || "—"}`,
      `Interested in: ${fields.want || "—"}`,
      `Name: ${fields.name || "—"}`,
      `Email: ${email}`,
      file ? `Attached: ${file.filename}` : "No attachment",
    ];

    await mailer.sendMail({
      from: MAIL_FROM,
      to: MAIL_TO,
      replyTo: email,
      subject: `New brief: ${oneLine(words)}`,
      text: lines.join("\n"),
      attachments: file ? [file] : [],
    });

    return end(200, { ok: true });
  } catch (err) {
    console.error("brief failed:", err.message);
    return end(500, { error: "could not send" });
  }
});

server.listen(PORT, () =>
  console.log(`brief handler listening on :${PORT} — briefs go to ${MAIL_TO}`),
);
