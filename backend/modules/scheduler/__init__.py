"""
Module Scheduler — routines programmées (heure + jours de la semaine).

Les routines sont persistées dans un fichier JSON et évaluées chaque minute
par une boucle asyncio en arrière-plan.
"""

from modules.scheduler.store import RoutineStore
from modules.scheduler.handler import register

__all__ = ["RoutineStore", "register"]
