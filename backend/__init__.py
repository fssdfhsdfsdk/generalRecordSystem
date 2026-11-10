"""Backend packages for the General Record System.

The web layer lives in ``server.py``; each subsystem owns its own store and
database file:

* ``backend.records``      -> ``data/records.db``
* ``backend.plans``        -> ``data/plans.db``
* ``backend.docs``         -> ``data/docs.db``
* ``backend.repositories`` -> ``data/repository.db``
* ``backend.tools``        -> ``data/tools.db``
"""
