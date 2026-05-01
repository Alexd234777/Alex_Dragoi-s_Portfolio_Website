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
const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";
const web3FormsAccessKey = (process.env.WEB3FORMS_ACCESS_KEY || "").trim();

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
const hasWeb3Forms = Boolean(web3FormsAccessKey);

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

function getSendTimeoutMs() {
    const timeoutMs = Number.parseInt(process.env.CONTACT_SEND_TIMEOUT_MS || "", 10);
    return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
}

function getContactSubject(value) {
    return `Portfolio inquiry from ${value.name}`;
}

function buildContactDetails(value) {
    return [
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
}

function buildContactEmail(value) {
    const recipient = (process.env.CONTACT_TO || process.env.GMAIL_USER || "").trim();
    const subject = getContactSubject(value);
    const details = buildContactDetails(value);

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

function buildWeb3FormsPayload(value) {
    return {
        access_key: web3FormsAccessKey,
        subject: getContactSubject(value),
        from_name: "Alex Dragoi Portfolio",
        name: value.name,
        email: value.email,
        replyto: value.email,
        company: value.company || "Not provided",
        project_type: value.projectType || "Not provided",
        budget: value.budget || "Not provided",
        timeline: value.timeline || "Not provided",
        source: "Portfolio website",
        message: value.message
    };
}

async function sendWeb3FormsEmail(value) {
    if (typeof fetch !== "function") {
        const error = new Error("The server Node version does not support fetch.");
        error.code = "FETCH_UNAVAILABLE";
        throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getSendTimeoutMs());

    try {
        const response = await fetch(WEB3FORMS_ENDPOINT, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(buildWeb3FormsPayload(value)),
            signal: controller.signal
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success !== true) {
            const error = new Error(result.message || `Web3Forms returned HTTP ${response.status}.`);
            error.code = "WEB3FORMS_ERROR";
            error.responseCode = response.status;
            throw error;
        }

        return result;
    } catch (sendError) {
        if (sendError.name === "AbortError") {
            const timeoutError = new Error("Web3Forms delivery timed out.");
            timeoutError.code = "EMAIL_TIMEOUT";
            throw timeoutError;
        }

        throw sendError;
    } finally {
        clearTimeout(timer);
    }
}

function sendGmailEmail(value) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const timeoutError = new Error("Email delivery timed out.");
            timeoutError.code = "EMAIL_TIMEOUT";
            reject(timeoutError);
        }, getSendTimeoutMs());

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

function sendContactEmail(value) {
    if (hasWeb3Forms) {
        return sendWeb3FormsEmail(value);
    }

    return sendGmailEmail(value);
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

    if (!hasWeb3Forms && !mailer) {
        return sendClientError(
            req,
            res,
            503,
            "Email is not configured yet. Please set WEB3FORMS_ACCESS_KEY on the server."
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
            provider: hasWeb3Forms ? "web3forms" : "gmail",
            code: sendError.code,
            command: sendError.command,
            responseCode: sendError.responseCode,
            message: sendError.message
        });

        return sendClientError(
            req,
            res,
            502,
            "Email delivery failed. Please check the contact form environment settings and try again."
        );
    }
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
