"""
MediKiosk — RapidOCR Document Extraction Adapter
Line-indexed OCR with bounding polygon detection for evidence boxing.

Pipeline:
  1. RapidOCR detects text lines with bounding polygons
  2. Lines are indexed [L1, L2, ...] for LLM citation
  3. LLM extracts medications with mandatory source_lines citations
  4. Backend deterministically renders SVG highlight boxes over original Rx

Ref: MediKiosk_Tech_Stack_Finalized.md Section 2, Section 7
"""

import io
import json
import logging
from pathlib import Path
from typing import Optional
from app.schemas.document import OCRLine

logger = logging.getLogger("medikiosk.ocr")


class OCRResult:
    """Result from prescription/document OCR processing."""
    def __init__(self, lines: list[OCRLine], raw_text: str, overall_confidence: float):
        self.lines = lines
        self.raw_text = raw_text
        self.overall_confidence = overall_confidence

    @property
    def indexed_text(self) -> str:
        """Generate line-indexed text for LLM consumption.
        Format: [L1] Tab. Metformin 500mg 1-0-1
                [L2] Tab. Aspirin 75mg 0-0-1
        """
        return "\n".join(
            f"[L{line.line_index}] {line.text}"
            for line in self.lines
        )

    def to_dict(self) -> dict:
        return {
            "lines": [{"line_index": l.line_index, "text": l.text, "bbox": l.bbox, "confidence": l.confidence} for l in self.lines],
            "raw_text": self.raw_text,
            "overall_confidence": self.overall_confidence,
            "indexed_text": self.indexed_text
        }


class OCRService:
    """
    RapidOCR wrapper with line polygon indexing.

    Uses rapidocr_onnxruntime (CPU, ~800MB RAM, 0 MB VRAM).
    Processes a full A4 prescription in <1.5 seconds on CPU.
    """

    def __init__(self):
        self._engine = None
        self._loaded = False

    def _load_engine(self):
        """Lazy-load RapidOCR engine."""
        if not self._loaded:
            try:
                from rapidocr_onnxruntime import RapidOCR
                self._engine = RapidOCR()
                self._loaded = True
                logger.info("RapidOCR engine loaded (ONNX CPU)")
            except ImportError:
                logger.warning(
                    "rapidocr_onnxruntime not installed. "
                    "Install with: pip install rapidocr_onnxruntime"
                )
                raise
            except Exception as e:
                logger.error(f"Failed to load RapidOCR: {e}")
                raise

    def extract_text(self, path_or_bytes) -> dict:
        """
        Compatibility helper used by patient portal / registration uploads.
        Accepts a filesystem path or raw bytes and returns a plain dict:
          { "text": str, "lines": list, "overall_confidence": float }
        OCR failures never raise — callers can always persist the file.
        """
        try:
            if isinstance(path_or_bytes, (bytes, bytearray)):
                image_bytes = bytes(path_or_bytes)
            else:
                p = Path(str(path_or_bytes))
                suffix = p.suffix.lower()
                if suffix in {".pdf", ".doc", ".docx", ".txt"}:
                    # Non-image uploads are stored as-is; OCR is image-only today.
                    return {"text": "", "lines": [], "overall_confidence": 0.0}
                image_bytes = p.read_bytes()
            result = self.process_image(image_bytes)
            payload = result.to_dict()
            return {
                "text": payload.get("raw_text") or "",
                "lines": payload.get("lines") or [],
                "overall_confidence": payload.get("overall_confidence") or 0.0,
            }
        except Exception as e:
            logger.warning(f"extract_text skipped: {e}")
            return {"text": "", "lines": [], "overall_confidence": 0.0}

    def process_image(self, image_bytes: bytes) -> OCRResult:
        """
        Process a prescription/document image and extract text lines with bounding boxes.

        Args:
            image_bytes: Raw image bytes (JPEG, PNG, etc.)

        Returns:
            OCRResult with indexed lines, bounding polygons, and confidence scores.
        """
        self._load_engine()

        try:
            import numpy as np
            from PIL import Image

            # Load image from bytes
            image = Image.open(io.BytesIO(image_bytes))
            img_array = np.array(image)

            # Run RapidOCR
            result, elapse = self._engine(img_array)

            if result is None:
                logger.warning("RapidOCR returned no results for this image.")
                return OCRResult(lines=[], raw_text="", overall_confidence=0.0)

            # Parse results into indexed lines
            lines: list[OCRLine] = []
            total_confidence = 0.0

            for idx, (bbox_points, text, confidence) in enumerate(result, start=1):
                # RapidOCR returns bbox as [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
                # Convert to [x_min, y_min, x_max, y_max] for simpler downstream use
                xs = [int(p[0]) for p in bbox_points]
                ys = [int(p[1]) for p in bbox_points]
                bbox = [min(xs), min(ys), max(xs), max(ys)]

                lines.append(OCRLine(
                    line_index=idx,
                    text=text.strip(),
                    bbox=bbox,
                    confidence=round(float(confidence), 4)
                ))
                total_confidence += float(confidence)

            overall_conf = total_confidence / len(lines) if lines else 0.0
            raw_text = "\n".join(line.text for line in lines)

            logger.info(
                f"OCR completed: {len(lines)} lines detected, "
                f"avg confidence: {overall_conf:.2f}, "
                f"elapsed: {elapse}"
            )

            return OCRResult(
                lines=lines,
                raw_text=raw_text,
                overall_confidence=round(overall_conf, 4)
            )

        except ImportError as e:
            logger.error(f"Missing dependency for OCR: {e}")
            raise
        except Exception as e:
            logger.error(f"OCR processing failed: {e}")
            return OCRResult(lines=[], raw_text="", overall_confidence=0.0)

    def generate_evidence_image(
        self,
        image_bytes: bytes,
        highlight_lines: list[int],
        output_path: str
    ) -> str:
        """
        Generate an evidence-boxed image with highlighted line regions.
        Draws yellow pulsing highlight boxes around the specified OCR line indices.

        Args:
            image_bytes: Original prescription image bytes
            highlight_lines: Line indices to highlight (e.g. [2, 3])
            output_path: Path to save the highlighted image

        Returns:
            Path to the saved highlighted image.
        """
        try:
            from PIL import Image, ImageDraw

            image = Image.open(io.BytesIO(image_bytes))
            draw = ImageDraw.Draw(image, "RGBA")

            # First, we need the OCR results to get bounding boxes
            ocr_result = self.process_image(image_bytes)

            for line in ocr_result.lines:
                if line.line_index in highlight_lines:
                    # Draw semi-transparent yellow highlight box
                    bbox = line.bbox  # [x_min, y_min, x_max, y_max]
                    # Draw filled rectangle with transparency
                    draw.rectangle(
                        [bbox[0] - 4, bbox[1] - 4, bbox[2] + 4, bbox[3] + 4],
                        fill=(255, 255, 0, 80),    # Semi-transparent yellow fill
                        outline=(255, 200, 0, 255), # Solid yellow border
                        width=3
                    )

            # Save the highlighted image
            output = Path(output_path)
            output.parent.mkdir(parents=True, exist_ok=True)
            image.save(str(output), "JPEG", quality=90)

            logger.info(f"Evidence image saved: {output_path} (highlighted lines: {highlight_lines})")
            return str(output)

        except Exception as e:
            logger.error(f"Evidence image generation failed: {e}")
            return ""

    def generate_evidence_image_from_boxes(
        self,
        image_bytes: bytes,
        boxes_2d: list[list[int]],
        output_path: str
    ) -> str:
        """
        Generate an evidence-boxed image from normalized 2D bounding boxes [ymin, xmin, ymax, xmax] (0-1000 scale).

        Args:
            image_bytes: Original prescription image bytes
            boxes_2d: List of [ymin, xmin, ymax, xmax] 0-1000 normalized coordinates
            output_path: Path to save the highlighted image

        Returns:
            Path to the saved highlighted image.
        """
        try:
            from PIL import Image, ImageDraw

            image = Image.open(io.BytesIO(image_bytes))
            draw = ImageDraw.Draw(image, "RGBA")
            width, height = image.size

            for box in boxes_2d:
                if len(box) == 4:
                    # Descale 0-1000 normalized coordinates to actual pixel coordinates
                    ymin, xmin, ymax, xmax = box
                    x1 = int((xmin / 1000.0) * width)
                    y1 = int((ymin / 1000.0) * height)
                    x2 = int((xmax / 1000.0) * width)
                    y2 = int((ymax / 1000.0) * height)

                    # Draw semi-transparent green/yellow glowing highlight box
                    draw.rectangle(
                        [max(0, x1 - 4), max(0, y1 - 4), min(width, x2 + 4), min(height, y2 + 4)],
                        fill=(0, 220, 100, 60),      # Glowing green transparent fill
                        outline=(0, 200, 80, 255),    # Vibrant green border
                        width=3
                    )

            # Save the highlighted image
            output = Path(output_path)
            output.parent.mkdir(parents=True, exist_ok=True)
            image.save(str(output), "JPEG", quality=90)

            logger.info(f"Evidence image (2D boxes) saved: {output_path} ({len(boxes_2d)} boxes)")
            return str(output)

        except Exception as e:
            logger.error(f"Evidence image generation from boxes failed: {e}")
            return ""



# Singleton
_ocr_service: Optional[OCRService] = None


def get_ocr_service() -> OCRService:
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService()
    return _ocr_service
