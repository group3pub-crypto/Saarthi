import sys
from redis import Redis
from rq import Queue, Worker
from rq.worker import SimpleWorker
from app.config import settings


def run_worker():
    conn = Redis.from_url(settings.REDIS_URL)
    worker_class = SimpleWorker if sys.platform == "win32" else Worker
    queue = Queue("default", connection=conn)
    worker = worker_class([queue], connection=conn)
    print(f"[*] SAARTHI RQ Worker started on queues: default (using {worker_class.__name__})")
    worker.work()


if __name__ == "__main__":
    run_worker()
