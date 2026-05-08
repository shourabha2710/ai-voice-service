import warnings
# Patch pydub.utils.get_encoder_name to avoid the warning
def _patched_get_encoder_name():
    return "ffmpeg"

def apply_pydub_patch():
    try:
        import pydub.utils
        pydub.utils.get_encoder_name = _patched_get_encoder_name
    except Exception:
        pass
