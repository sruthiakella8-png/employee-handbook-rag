
# Create your models here.
from django.db import models
from pgvector.django import VectorField, HnswIndex


class Document(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "processing"
        ACTIVE = "active"
        REPLACED = "replaced"
        FAILED = "failed"

    file_name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROCESSING)
    chunk_count = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.file_name} ({self.status})"


class Chunk(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="chunks")
    section_title = models.CharField(max_length=255)
    text = models.TextField()
    embedding = VectorField(dimensions=384)  # matches all-MiniLM-L6-v2

    class Meta:
        indexes = [
            HnswIndex(
                name="chunk_embedding_hnsw",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            )
        ]

    def __str__(self):
        return self.section_title