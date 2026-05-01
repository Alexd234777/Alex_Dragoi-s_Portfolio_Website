const navToggle = document.querySelector(".nav-toggle");
const navList = document.querySelector(".nav-list");
const contactForm = document.querySelector("#contactForm");
const formStatus = document.querySelector("#formStatus");
const submitButton = document.querySelector("#contactSubmit");
const year = document.querySelector("#year");
const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";
let contactConfigPromise;

if (year) {
    year.textContent = new Date().getFullYear();
}

if (navToggle && navList) {
    navToggle.addEventListener("click", () => {
        const isOpen = navToggle.getAttribute("aria-expanded") === "true";
        navToggle.setAttribute("aria-expanded", String(!isOpen));
        navList.classList.toggle("is-open", !isOpen);
    });

    navList.addEventListener("click", (event) => {
        if (event.target instanceof HTMLAnchorElement) {
            navToggle.setAttribute("aria-expanded", "false");
            navList.classList.remove("is-open");
        }
    });
}

function setStatus(message, type = "idle") {
    if (!formStatus) {
        return;
    }

    formStatus.textContent = message;
    formStatus.dataset.type = type;
}

function getPayload(form) {
    return Object.fromEntries(new FormData(form).entries());
}

function getContactConfig() {
    if (!contactConfigPromise) {
        contactConfigPromise = fetch("/api/contact-config", {
            cache: "no-store",
            headers: {
                "Accept": "application/json"
            }
        }).then((response) => {
            if (!response.ok) {
                return { provider: "server" };
            }

            return response.json();
        }).catch(() => ({ provider: "server" }));
    }

    return contactConfigPromise;
}

function buildWeb3FormsPayload(payload, accessKey) {
    return {
        access_key: accessKey,
        subject: `Portfolio inquiry from ${payload.name}`,
        from_name: "Alex Dragoi Portfolio",
        name: payload.name,
        email: payload.email,
        replyto: payload.email,
        company: payload.company || "Not provided",
        project_type: payload.projectType || "Not provided",
        budget: payload.budget || "Not provided",
        timeline: payload.timeline || "Not provided",
        source: "Portfolio website",
        botcheck: false,
        message: payload.message
    };
}

async function submitWithWeb3Forms(payload, config) {
    const response = await fetch(config.web3FormsEndpoint || WEB3FORMS_ENDPOINT, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(buildWeb3FormsPayload(payload, config.web3FormsAccessKey))
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success !== true) {
        const message = result.message || (result.body && result.body.message) || "The message could not be sent.";
        throw new Error(message);
    }

    return { message: "Thanks, your message was sent." };
}

async function submitWithServer(payload) {
    const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.message || "The message could not be sent.");
    }

    return result;
}

async function submitContact(payload) {
    if (payload.website) {
        return { message: "Thanks, your message was received." };
    }

    const config = await getContactConfig();

    if (config.provider === "web3forms" && config.web3FormsAccessKey) {
        return submitWithWeb3Forms(payload, config);
    }

    return submitWithServer(payload);
}

function warmServer() {
    fetch("/health", {
        cache: "no-store",
        headers: {
            "Accept": "application/json"
        }
    }).catch(() => {});
    getContactConfig();
}

if (contactForm) {
    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(warmServer, { timeout: 3000 });
    } else {
        window.setTimeout(warmServer, 1200);
    }

    contactForm.addEventListener("focusin", warmServer, { once: true });
    contactForm.addEventListener("pointerenter", warmServer, { once: true });

    contactForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!contactForm.checkValidity()) {
            contactForm.reportValidity();
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
        setStatus("Sending your inquiry...", "loading");

        try {
            const result = await submitContact(getPayload(contactForm));

            contactForm.reset();
            setStatus(result.message || "Thanks, your message was sent.", "success");
        } catch (error) {
            setStatus(error.message || "The message could not be sent. Please try again.", "error");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Send inquiry";
        }
    });
}
