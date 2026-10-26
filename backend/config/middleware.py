from django.conf import settings


class AllowMediaFrameEmbedding:
    """
    Strip ``X-Frame-Options`` from responses for media file requests so that
    uploaded resumes / CVs can be previewed inside an <embed> or <iframe> on
    the frontend dashboard.  All other responses keep the header unchanged.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        media_url = getattr(settings, "MEDIA_URL", "/media/")
        if request.path.startswith(media_url):
            response.headers.pop("X-Frame-Options", None)
        return response
