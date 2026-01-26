"""Email sender service - sends alerts via SMTP."""
import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class EmailConfig:
    """SMTP configuration for sending emails."""
    host: str
    port: int
    username: str
    password: str
    use_tls: bool = True
    from_address: str = ""
    to_address: str = ""  # Comma-separated list of email addresses


class EmailSenderService:
    """Service for sending email alerts via SMTP."""
    
    def _parse_recipients(self, to_address: str) -> List[str]:
        """Parse comma-separated email addresses into a list."""
        if not to_address:
            return []
        # Split by comma, strip whitespace, filter empty
        return [addr.strip() for addr in to_address.split(",") if addr.strip()]
    
    async def send_email(
        self,
        config: EmailConfig,
        subject: str,
        body: str,
    ) -> bool:
        """Send an email using SMTP.
        
        Supports comma-separated list of recipients in to_address.
        Returns True on success, False on failure.
        """
        logger.info(f"Attempting to send email: {subject}")
        logger.info(f"SMTP Config: host={config.host}, port={config.port}, tls={config.use_tls}, username={config.username or 'not set'}")
        
        if not config.host or not config.to_address:
            logger.warning("Email not configured - missing host or to_address")
            return False
        
        # Parse recipients list
        recipients = self._parse_recipients(config.to_address)
        if not recipients:
            logger.warning("No valid recipients found in to_address")
            return False
        
        logger.info(f"Recipients: {recipients}")
        
        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = config.from_address or config.username
            msg["To"] = ", ".join(recipients)  # Header shows all recipients
            
            # Plain text body
            text_part = MIMEText(body, "plain")
            msg.attach(text_part)
            
            from_addr = config.from_address or config.username
            logger.info(f"From address: {from_addr}")
            
            # Send email
            if config.use_tls:
                # Use STARTTLS
                logger.info(f"Connecting to {config.host}:{config.port} with STARTTLS...")
                context = ssl.create_default_context()
                with smtplib.SMTP(config.host, config.port, timeout=30) as server:
                    logger.info("Connected, starting TLS...")
                    server.starttls(context=context)
                    logger.info("TLS established")
                    if config.username and config.password:
                        logger.info(f"Authenticating as {config.username}...")
                        server.login(config.username, config.password)
                        logger.info("Authentication successful")
                    logger.info("Sending email...")
                    server.sendmail(from_addr, recipients, msg.as_string())
            else:
                # Plain SMTP
                logger.info(f"Connecting to {config.host}:{config.port} (no TLS)...")
                with smtplib.SMTP(config.host, config.port, timeout=30) as server:
                    logger.info("Connected")
                    if config.username and config.password:
                        logger.info(f"Authenticating as {config.username}...")
                        server.login(config.username, config.password)
                        logger.info("Authentication successful")
                    logger.info("Sending email...")
                    server.sendmail(from_addr, recipients, msg.as_string())
            
            recipient_count = len(recipients)
            logger.info(f"Email sent successfully to {recipient_count} recipient(s): {subject}")
            return True
            
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed for user '{config.username}': {e}")
            logger.error(f"Check username and password. For Gmail, use an App Password.")
            return False
        except smtplib.SMTPConnectError as e:
            logger.error(f"Failed to connect to SMTP server {config.host}:{config.port}: {e}")
            return False
        except smtplib.SMTPServerDisconnected as e:
            logger.error(f"SMTP server unexpectedly disconnected: {e}")
            return False
        except smtplib.SMTPRecipientsRefused as e:
            logger.error(f"Recipients refused by server: {e}")
            return False
        except smtplib.SMTPSenderRefused as e:
            logger.error(f"Sender address refused: {e}")
            return False
        except smtplib.SMTPDataError as e:
            logger.error(f"SMTP data error: {e}")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {type(e).__name__}: {e}")
            return False
        except ConnectionRefusedError as e:
            logger.error(f"Connection refused to {config.host}:{config.port}: {e}")
            return False
        except TimeoutError as e:
            logger.error(f"Timeout connecting to {config.host}:{config.port}: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending email: {type(e).__name__}: {e}")
            return False


# Global instance
email_sender_service = EmailSenderService()
