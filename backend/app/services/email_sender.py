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
        if not config.host or not config.to_address:
            logger.debug("Email not configured, skipping")
            return False
        
        # Parse recipients list
        recipients = self._parse_recipients(config.to_address)
        if not recipients:
            logger.debug("No valid recipients, skipping")
            return False
        
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
            
            # Send email
            if config.use_tls:
                # Use STARTTLS
                context = ssl.create_default_context()
                with smtplib.SMTP(config.host, config.port, timeout=30) as server:
                    server.starttls(context=context)
                    if config.username and config.password:
                        server.login(config.username, config.password)
                    server.sendmail(from_addr, recipients, msg.as_string())
            else:
                # Plain SMTP
                with smtplib.SMTP(config.host, config.port, timeout=30) as server:
                    if config.username and config.password:
                        server.login(config.username, config.password)
                    server.sendmail(from_addr, recipients, msg.as_string())
            
            recipient_count = len(recipients)
            logger.info(f"Email sent successfully to {recipient_count} recipient(s): {subject}")
            return True
            
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False


# Global instance
email_sender_service = EmailSenderService()
