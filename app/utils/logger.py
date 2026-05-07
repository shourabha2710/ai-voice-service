from loguru import logger
from pathlib import Path
from app.config.settings import settings

def setup_logging(log_path: Path = None):
    logger.remove()
    if log_path:
        log_path.mkdir(exist_ok=True)
        logger.add(
            log_path / "app.log",
            rotation="10 MB",
            retention="7 days",
            level="INFO",
            format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}"
        )
    logger.add(
        sink=lambda msg: print(msg),
        level="INFO",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}"
    )
    return logger
