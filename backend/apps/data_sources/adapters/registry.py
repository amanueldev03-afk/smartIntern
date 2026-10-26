"""
Adapter registry — maps a ``DataSource`` type to its concrete adapter.

This is the lookup point the collection pipeline uses to fetch and
normalize listings, so new per-source adapters (Section 2.5, Task 5.2)
only need to be registered here.
"""

from apps.data_sources.models import DataSource

from .api_adapter import APIAdapter
from .career_site import CareerSiteAdapter
from .rss import RSSAdapter


ADAPTER_REGISTRY = {
    DataSource.Type.API: APIAdapter,
    DataSource.Type.RSS: RSSAdapter,
    DataSource.Type.CAREER_SITE: CareerSiteAdapter,
}


def get_adapter(source):
    """
    Return the adapter instance for a ``DataSource``.

    Args:
        source: A ``DataSource`` model instance.

    Returns:
        A concrete ``BaseAdapter`` subclass bound to the source.

    Raises:
        ValueError: When no adapter is registered for the source type.
    """
    adapter_class = ADAPTER_REGISTRY.get(source.type)

    if adapter_class is None:
        raise ValueError(
            f"No adapter configured for DataSource type "
            f"'{source.type}'."
        )

    return adapter_class(source)