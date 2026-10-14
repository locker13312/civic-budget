class DomainError(Exception):
    """Порушення бізнес-правила; code стабільний і йде в API."""

    code = "domain_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message
