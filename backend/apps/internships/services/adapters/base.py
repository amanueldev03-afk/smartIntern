from abc import ABC, abstractmethod


class BaseInternshipAdapter(ABC):
    """
    Base interface for all internship source adapters.
    """

    def __init__(self, source):
        self.source = source

    @abstractmethod
    def fetch(self):
        """
        Fetch raw internship records from the source.

        Must return a list of dictionaries.
        """
        raise NotImplementedError