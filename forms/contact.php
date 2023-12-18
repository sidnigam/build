<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $name = htmlspecialchars(stripslashes(trim($_POST["name"])));
    $email = htmlspecialchars(stripslashes(trim($_POST["email"])));
    $subject = htmlspecialchars(stripslashes(trim($_POST["subject"])));
    $message = htmlspecialchars(stripslashes(trim($_POST["message"])));

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        // Email is invalid
        echo "Invalid Email";
    } else {
        $to = 'sid.nigam@outlook.com'; // Replace with your email address
        $body = "Name: $name\nEmail: $email\nSubject: $subject\nMessage:\n$message";
        $headers = "From: $email";

        if (mail($to, $subject, $body, $headers)) {
            echo "Thank You! Your message has been sent.";
        } else {
            echo "Oops! Something went wrong, we couldn't send your message.";
        }
    }
} else {
    echo "Form submission failed!";
}
?>
