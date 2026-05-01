const navToggle = document.querySelector(".nav-toggle");
const navList = document.querySelector(".nav-list");
const contactForm = document.querySelector("#contactForm");
const formStatus = document.querySelector("#formStatus");
const submitButton = document.querySelector("#contactSubmit");
const year = document.querySelector("#year");

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

function warmServer() {
    fetch("/health", {
        cache: "no-store",
        headers: {
            "Accept": "application/json"
        }
    }).catch(() => {});
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
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(getPayload(contactForm))
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.message || "The message could not be sent.");
            }

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
