import asyncio
from io import BytesIO

from PIL import Image, ImageOps

from recallstack.modules.knowledge.infrastructure.safe_fetch import SafeFetcher

IMAGE_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})


def transform_image(content: bytes) -> bytes:
    with Image.open(BytesIO(content), formats=["JPEG", "PNG", "WEBP"]) as image:
        if image.width * image.height > 20_000_000 or min(image.size) < 240:
            raise ValueError("Image dimensions outside accepted range")
        if getattr(image, "n_frames", 1) != 1:
            raise ValueError("Animated images are not accepted")
        image.load()
        oriented = ImageOps.exif_transpose(image)
        rgb = oriented.convert("RGB")
        resized = ImageOps.fit(rgb, (1080, 1350), method=Image.Resampling.LANCZOS)
        output = BytesIO()
        resized.save(output, format="WEBP", quality=82, method=4)
        payload = output.getvalue()
        if len(payload) > 1_048_576:
            raise ValueError("Processed image exceeds one megabyte")
        return payload


class WebPImageProcessor:
    def __init__(self, fetcher: SafeFetcher, *, max_bytes: int = 8_388_608) -> None:
        self._fetcher, self._max_bytes = fetcher, max_bytes

    async def process(self, url: str) -> bytes:
        image = await self._fetcher.fetch(url, max_bytes=self._max_bytes, allowed_types=IMAGE_TYPES)
        return await asyncio.to_thread(transform_image, image.body)
