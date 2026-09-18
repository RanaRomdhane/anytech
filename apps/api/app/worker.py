from celery import Celery

from app.config import settings

celery_app = Celery("anytech", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_serializer="json",
    accept_content=["json"],
)


@celery_app.task(name="anytech.healthcheck")
def healthcheck() -> str:
    return "ok"
