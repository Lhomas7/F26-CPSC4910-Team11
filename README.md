Setup

Backend (Django):
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

Frontend (React), in a separate terminal:
cd frontend
npm install
npm start

Backend runs on http://localhost:8000
Frontend runs on http://localhost:3000

Sign-in is required to use the app. Create accounts from the login page
("Create Account" tab) or the Django admin.

What's working right now:
- Sign in / create driver and sponsor accounts
- View list of drivers assigned to a sponsor
- Link a driver to your sponsor company by their username
- View a single driver's details
- Approve a pending driver

Try it end to end:
1. Start the backend and frontend (see Setup above).
2. Open http://localhost:3000/drivers and sign up as a Driver (you'll be redirected to sign in first).
3. Sign out, then sign up as a Sponsor (company name of your choice).
4. On the driver list, use "Link a driver by username" with the driver's username.
5. The driver now appears in your list; click them to view their details and approve them.

