document.getElementById("contactForm").addEventListener("submit", async (event) => {
    event.preventDefault(); // Prevent default form submission behavior

    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const message = document.getElementById("message").value;

    if (!name || !email || !message) {
        alert("Please fill out all fields.");
        return;
    }

    try {
        const response = await fetch("https://alex-dragoi-s-portfolio-website.onrender.com/send-message", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ name, email, message }),
        });

        if (response.ok) {
            window.location.href = "/confirmation.html";
        } else {
            const errorData = await response.json();
            alert(`Error: ${errorData.message || "Failed to send message."}`);
        }
    } catch (error) {
        console.error("Error submitting form:", error);
        alert("An error occurred. Please try again.");
    }
});

