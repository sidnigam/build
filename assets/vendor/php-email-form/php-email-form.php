<?php
class PHP_Email_Form {
  public $to;
  public $from_name;
  public $from_email;
  public $subject;
  public $message;
  public $headers;

  public function __construct(){
    $this->to = 'sid.nigam@outlook.com'; // Replace with your email address
  }

  public function add_message( $message, $title = '' ) {
    $this->message .= ($title != '') ? '<strong>' . $title . '</strong>: ' : '';
    $this->message .= $message . '<br>';
  }

  public function send() {
    if( ! $this->to ) {
      return false;
    }

    if( ! $this->from_name ) {
      return false;
    }

    if( ! $this->from_email ) {
      return false;
    }

    if( ! $this->message ) {
      return false;
    }

    $this->subject = ($this->subject != '') ? $this->subject : 'New Message';

    $this->headers = "MIME-Version: 1.0" . "\r\n";
    $this->headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
    $this->headers .= 'From: ' . $this->from_name . '<' . $this->from_email . '>' . "\r\n";

    return mail($this->to, $this->subject, $this->message, $this->headers);
  }
}
?>
