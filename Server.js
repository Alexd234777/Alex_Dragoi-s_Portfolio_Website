require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const Joi = require("joi");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.use(express.json({ limit: "16kb" }));

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", [
        "default-src 'self'",
        "base-uri 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "img-src 'self' data:",
        "object-src 'none'",
        "script-src 'self'",
        "style-src 'self'"
    ].join("; "));
    next();
});

app.use(express.static(publicDir, {
    etag: true,
    lastModified: true,
    maxAge: isProduction ? "7d" : 0,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
            return;
        }

        res.setHeader(
            "Cache-Control",
            isProduction
                ? "public, max-age=604800, stale-while-revalidate=86400"
                : "no-cache"
        );
    }
}));

app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many contact attempts. Please wait a few minutes and try again." }
});

const contactSchema = Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
    email: Joi.string().trim().email({ tlds: { allow: false } }).max(120).required(),
    company: Joi.string().trim().allow("").max(100).optional(),
    projectType: Joi.string().trim().allow("").valid(
        "",
        "Website redesign",
        "New website",
        "Web app",
        "AI or automation",
        "Consulting",
        "Other"
    ).optional(),
    budget: Joi.string().trim().allow("").valid(
        "",
        "Under $1,000",
        "$1,000 - $3,000",
        "$3,000 - $7,500",
        "$7,500+",
        "Not sure yet"
    ).optional(),
    timeline: Joi.string().trim().allow("").valid(
        "",
        "ASAP",
        "2-4 weeks",
        "1-3 months",
        "Flexible"
    ).optional(),
    message: Joi.string().trim().min(20).max(3000).required(),
    website: Joi.string().trim().allow("").max(200).optional()
});

function createMailer() {
    const user = (process.env.GMAIL_USER || "").trim();
    const pass = (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || "").replace(/\s/g, "");

    if (!user || !pass) {
        return null;
    }

    return nodemailer.createTransport({
        service: "gmail",
        pool: true,
        maxConnections: 2,
        maxMessages: 20,
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000,
        auth: { user, pass }
    });
}

const mailer = createMailer();
const mailUser = (process.env.GMAIL_USER || "").trim();

function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[character]));
}

function wantsHtml(req) {
    const accept = req.get("accept") || "";
    return accept.includes("text/html") && !accept.includes("application/json");
}

function sendClientError(req, res, status, message) {
    if (wantsHtml(req)) {
        return res.status(status).send(`<!doctype html><title>Contact Error</title><p>${escapeHtml(message)}</p><p><a href="/#contact">Return to contact form</a></p>`);
    }

    return res.status(status).json({ message });
}

function buildContactEmail(value) {
    const recipient = process.env.CONTACT_TO || process.env.GMAIL_USER;
    const subject = `Portfolio inquiry from ${value.name}`;
    const details = [
        `Name: ${value.name}`,
        `Email: ${value.email}`,
        `Company: ${value.company || "Not provided"}`,
        `Project type: ${value.projectType || "Not provided"}`,
        `Budget: ${value.budget || "Not provided"}`,
        `Timeline: ${value.timeline || "Not provided"}`,
        "",
        "Message:",
        value.message
    ].join("\n");

    return {
        from: `"Alex Dragoi Portfolio" <${mailUser}>`,
        to: recipient,
        replyTo: value.email,
        subject,
        text: details,
        html: `
            <h2>New portfolio inquiry</h2>
            <p><strong>Name:</strong> ${escapeHtml(value.name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(value.email)}</p>
            <p><strong>Company:</strong> ${escapeHtml(value.company || "Not provided")}</p>
            <p><strong>Project type:</strong> ${escapeHtml(value.projectType || "Not provided")}</p>
            <p><strong>Budget:</strong> ${escapeHtml(value.budget || "Not provided")}</p>
            <p><strong>Timeline:</strong> ${escapeHtml(value.timeline || "Not provided")}</p>
            <p><strong>Message:</strong></p>
            <p>${escapeHtml(value.message).replace(/\n/g, "<br>")}</p>
        `
    };
}

function sendContactEmail(value) {
    const timeoutMs = Number(process.env.CONTACT_SEND_TIMEOUT_MS || 10000);

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const timeoutError = new Error("Email delivery timed out.");
            timeoutError.code = "EMAIL_TIMEOUT";
            reject(timeoutError);
        }, timeoutMs);

        mailer.sendMail(buildContactEmail(value))
            .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
            .catch((sendError) => {
                clearTimeout(timer);
                reject(sendError);
            });
    });
}

app.post("/api/contact", contactLimiter, async (req, res) => {
    const { error, value } = contactSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        return sendClientError(req, res, 400, "Please check the highlighted fields and try again.");
    }

    if (value.website) {
        return res.status(200).json({ message: "Thanks, your message was received." });
    }

    if (!mailer) {
        return sendClientError(
            req,
            res,
            503,
            "Email is not configured yet. Please set GMAIL_USER and GMAIL_APP_PASSWORD on the server."
        );
    }

    try {
        await sendContactEmail(value);

        if (wantsHtml(req)) {
            return res.redirect(303, "/confirmation.html");
        }

        return res.status(200).json({ message: "Thanks, your message was sent." });
    } catch (sendError) {
        console.error("Contact email failed:", {
            code: sendError.code,
            command: sendError.command,
            responseCode: sendError.responseCode,
            message: sendError.message
        });

        return sendClientError(
            req,
            res,
            502,
            "Email delivery failed. Please check the contact email settings and try again."
        );
    }
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
