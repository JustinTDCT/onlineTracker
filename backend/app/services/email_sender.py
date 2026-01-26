"""Email sender service - sends alerts via SMTP."""
import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
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
    to_address: str = ""


class EmailSenderService:
    """Service for sending email alerts via SMTP."""
    
    async def send_email(
        self,
        config: EmailConfig,
        subject: str,
        body: str,
    ) -> bool:
        """Send an email using SMTP.
        
        Returns True on success, False on failure.
        """
        if not config.host or not config.to_address:
            logger.debug("Email not configured, skipping")
            return False
        
        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = config.from_address or config.username
            msg["To"] = config.to_address
            
            # Plain text body
            text_part = MIMEText(body, "plain")
            msg.attach(text_part)
            
            # Send email
            if config.use_tls:
                # Use STARTTLS
                context = ssl.create_default_context()
                with smtplib.SMTP(config.host, config.port, timeout=30) as server:
                    server.starttls(context=context)
                    if config.username and config.password:
                        server.login(config.username, config.password)
                    server.sendmail(
                        config.from_address or config.username,
                        config.to_address,
                        msg.as_string(),
                    )
            else:
                # Plain SMTP
                with smtplib.SMTP(config.host, config.port, timeout=30) as server:
                    if config.username and config.password:
                        server.login(config.username, config.password)
                    server.sendmail(
                        config.from_address or config.username,
                        config.to_address,
                        msg.as_string(),
                    )
            
            logger.info(f"Email sent successfully: {subject}")
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
