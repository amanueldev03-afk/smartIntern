from .test_source import TestInternshipAdapter


ADAPTER_REGISTRY = {
    "test": TestInternshipAdapter,
    "api": TestInternshipAdapter,
}


def get_adapter(source):
    """
    Return the adapter configured for a source.
    """

    adapter_class = ADAPTER_REGISTRY.get(
        source.source_type
    )

    if adapter_class is None:
        raise ValueError(
            f"No adapter configured for source type "
            f"'{source.source_type}'."
        )

    return adapter_class(source)