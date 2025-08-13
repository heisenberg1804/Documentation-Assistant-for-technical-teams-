# PhotoSphere: Your Personal Photo Cloud 📸

[![Build Status](https://img.shields.io/travis/com/yourusername/photosphere.svg?style=flat-square)](https://travis-ci.com/yourusername/photosphere)
[![Coverage Status](https://img.shields.io/coveralls/github/yourusername/photosphere.svg?style=flat-square)](https://coveralls.io/github/yourusername/photosphere)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**PhotoSphere** is a modern, open-source platform for sharing, organizing, and discovering photos. It's built with Django and a powerful REST API, designed to be both a beautiful web application and a robust backend for mobile clients.

**Live Demo:** [https://demo.photosphere.app](https://demo.photosphere.app)



---

## ✨ Features

* **Secure User Authentication:** JWT-based authentication for a secure and stateless API.
* **Photo Uploads & Management:** Upload high-resolution photos. Support for common formats (`JPEG`, `PNG`, `WEBP`).
* **Smart Albums:** Organize photos into public or private albums.
* **EXIF Data Extraction:** Automatically reads and displays metadata like camera model, aperture, and location.
* **Powerful Search:** Full-text search on photo titles, descriptions, and tags powered by PostgreSQL.
* **Social Interaction:** Like and comment on photos to engage with the community.
* **RESTful API:** A well-documented API for third-party integrations and mobile app development.

---

## 🛠️ Tech Stack

* **Backend:** **Django** & **Django Rest Framework**
* **Database:** **PostgreSQL**
* **Async Tasks:** **Celery** with **Redis** as the message broker
* **Caching:** **Redis**
* **Containerization:** **Docker** & **Docker Compose**
* **Deployment:** Gunicorn & Nginx

---

## 🚀 Getting Started

Follow these instructions to get the project running locally for development and testing.

### **Prerequisites**

* **Git**
* **Docker** (`v20.0+`)
* **Docker Compose** (`v2.0+`)

### **Installation & Setup**

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/yourusername/photosphere.git](https://github.com/yourusername/photosphere.git)
    cd photosphere
    ```

2.  **Create an environment file:**
    Copy the example environment file and customize it if needed. For local development, the default values are usually sufficient.
    ```bash
    cp .env.example .env
    ```

3.  **Build and run the Docker containers:**
    This command will build the necessary Docker images and start all the services (web server, database, etc.).
    ```bash
    docker-compose up --build -d
    ```
    The initial build might take a few minutes. The `-d` flag runs the containers in detached mode.

4.  **Apply database migrations:**
    Run the initial database migrations to set up the schema.
    ```bash
    docker-compose exec web python manage.py migrate
    ```

The application should now be running and accessible at `http://localhost:8000`.

---

## 🏃‍♂️ Running the Application

### **Development Server**

* **Start:** `docker-compose up`
* **Stop:** `docker-compose down`

### **Running Tests**

Execute the full test suite to ensure everything is working as expected.
```bash
docker-compose exec web python manage.py test