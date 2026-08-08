import io
import os
import unittest
import zipfile
import fitz
from fastapi.testclient import TestClient
from PIL import Image
from reportlab.pdfgen import canvas

from backend.main import app

class TestConversionEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        
        # 1. Create a mock single-page PDF
        cls.pdf_1page_bytes = io.BytesIO()
        c1 = canvas.Canvas(cls.pdf_1page_bytes)
        c1.drawString(100, 750, "Hello World from Single Page PDF")
        c1.save()
        cls.pdf_1page_data = cls.pdf_1page_bytes.getvalue()

        # 2. Create a mock multi-page PDF (3 pages)
        cls.pdf_3page_bytes = io.BytesIO()
        c3 = canvas.Canvas(cls.pdf_3page_bytes)
        c3.drawString(100, 750, "Page 1 of Multi-page PDF")
        c3.showPage()
        c3.drawString(100, 750, "Page 2 of Multi-page PDF")
        c3.showPage()
        c3.drawString(100, 750, "Page 3 of Multi-page PDF")
        c3.showPage()
        c3.save()
        cls.pdf_3page_data = cls.pdf_3page_bytes.getvalue()

        # 3. Create mock images (JPG and PNG)
        cls.jpg_bytes_1 = io.BytesIO()
        img1 = Image.new("RGB", (100, 100), color="red")
        img1.save(cls.jpg_bytes_1, format="JPEG")
        cls.jpg_data_1 = cls.jpg_bytes_1.getvalue()

        cls.jpg_bytes_2 = io.BytesIO()
        img2 = Image.new("RGB", (150, 150), color="blue")
        img2.save(cls.jpg_bytes_2, format="JPEG")
        cls.jpg_data_2 = cls.jpg_bytes_2.getvalue()

    def test_pdf_to_jpg_single_page(self):
        # Sending single page PDF should return a straight JPG
        files = {"file": ("test_single.pdf", self.pdf_1page_data, "application/pdf")}
        response = self.client.post("/api/pdf-to-jpg", files=files, data={"join_pages": "false"})
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("content-type"), "image/jpeg")
        
        # Verify it's a valid image using PIL
        img = Image.open(io.BytesIO(response.content))
        img.verify()
        self.assertEqual(img.format, "JPEG")

    def test_pdf_to_jpg_multi_page_zipped(self):
        # Sending multi-page PDF with join_pages=false should return a zip file containing individual page images
        files = {"file": ("test_multi.pdf", self.pdf_3page_data, "application/pdf")}
        response = self.client.post("/api/pdf-to-jpg", files=files, data={"join_pages": "false"})
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("content-type"), "application/zip")
        
        # Verify it's a valid zip and contains 3 page images
        zip_file = zipfile.ZipFile(io.BytesIO(response.content))
        namelist = zip_file.namelist()
        self.assertEqual(len(namelist), 3)
        self.assertIn("test_multi_page_1.jpg", namelist)
        self.assertIn("test_multi_page_2.jpg", namelist)
        self.assertIn("test_multi_page_3.jpg", namelist)

    def test_pdf_to_jpg_multi_page_joined(self):
        # Sending multi-page PDF with join_pages=true should return a single combined JPG image
        files = {"file": ("test_multi.pdf", self.pdf_3page_data, "application/pdf")}
        response = self.client.post("/api/pdf-to-jpg", files=files, data={"join_pages": "true"})
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("content-type"), "image/jpeg")
        
        # Verify combined image properties (should be tall since it is 3 pages combined vertically)
        img = Image.open(io.BytesIO(response.content))
        width, height = img.size
        self.assertTrue(height > width)

    def test_jpg_to_pdf(self):
        # Sending multiple images should compile them into a single multi-page PDF
        files = [
            ("files", ("image1.jpg", self.jpg_data_1, "image/jpeg")),
            ("files", ("image2.jpg", self.jpg_data_2, "image/jpeg"))
        ]
        response = self.client.post("/api/jpg-to-pdf", files=files)
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("content-type"), "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF-"))

        # Verify page count of generated PDF using fitz
        doc = fitz.open(stream=response.content, filetype="pdf")
        self.assertEqual(len(doc), 2)
        doc.close()

    def test_evaluate_pdf(self):
        # Sending a PDF should return metadata, pages, image count, and recommendation
        files = {"file": ("test_multi.pdf", self.pdf_3page_data, "application/pdf")}
        response = self.client.post("/api/evaluate-pdf", files=files)
        
        self.assertEqual(response.status_code, 200)
        res_data = response.json()
        self.assertEqual(res_data["filename"], "test_multi.pdf")
        self.assertEqual(res_data["pages"], 3)
        self.assertEqual(res_data["image_count"], 0)
        self.assertIn("recommendation", res_data)
        self.assertIn("level", res_data["recommendation"])
        self.assertIn("text", res_data["recommendation"])

    def test_compress_pdf(self):
        # Sending a PDF for compression should return a PDF file
        files = {"file": ("test_multi.pdf", self.pdf_3page_data, "application/pdf")}
        response = self.client.post("/api/compress-pdf", files=files, data={"level": "medium"})
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("content-type"), "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF-"))

        # Verify page count is still 3 after compression
        doc = fitz.open(stream=response.content, filetype="pdf")
        self.assertEqual(len(doc), 3)
        doc.close()


if __name__ == "__main__":
    unittest.main()
