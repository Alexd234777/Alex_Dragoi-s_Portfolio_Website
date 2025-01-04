require("dotenv").config(); // Load environment variables from .env
const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000; // Use Render's assigned port or 3000 locally

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

// Serve the main index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Route to handle form submissions
app.post("/send-message", async (req, res) => {
    const { name, email, message } = req.body;

    // Nodemailer configuration
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        },
    });

    const mailOptions = {
        from: email,
        to: process.env.GMAIL_USER,
        subject: `New message from ${name}`,
        text: `You received a message from:
Name: ${name}
Email: ${email}
Message: ${message}`,
    };

    try {
        await transporter.sendMail(mailOptions);
        res.sendFile(path.join(__dirname, "public", "confirmation.html")); // Confirmation page
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ message: "Failed to send email. Please try again later." });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});



