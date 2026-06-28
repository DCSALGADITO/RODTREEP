# pyrefly: ignore [missing-import]
from locust import HttpUser, between, task

import time


class RoadtreepUser(HttpUser):
    wait_time = between(1, 3) # Les utilisateurs attendent entre 1 et 3 secondes entre chaque requête

    @task
    def load_homepage(self):
        # Charge la page principale
        self.client.get("/")
        
        # Charge virtuellement les styles et scripts pour simuler un vrai navigateur
        self.client.get("/style.css")
        self.client.get("/script.js")
