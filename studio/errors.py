class StudioError(RuntimeError):
    """Base error for local Studio operations."""


class RegistryError(StudioError):
    """Invalid or incomplete workflow registry."""


class ComfyUIError(StudioError):
    """ComfyUI API or workflow execution failure."""


class PipelineError(StudioError):
    """Pipeline orchestration failure."""
