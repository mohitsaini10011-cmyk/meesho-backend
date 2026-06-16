# Dyana Core Seller Suite

Premium AI-powered Meesho Seller Toolkit with:

## Features

### AI Listing Generator

* Product title generation
* Description generation
* Meesho form autofill
* Product attribute suggestions

### Image Optimizer

* Meesho-ready image processing
* Background cleanup
* Image enhancement
* Product centering

### Shipping Optimizer

* Weight suggestions
* Package dimension suggestions
* Shipping slab estimation

### Subscription System

* Email signup/login
* Device/IP lock
* Monthly plans
* Yearly plans
* Lifetime plans

### Admin Panel

* User management
* Subscription management
* Block/unblock users
* Reset device/IP lock
* Login logs
* Plan updates

## Backend APIs

### Authentication

POST /auth/signup

POST /auth/login

POST /auth/check-session

POST /auth/logout

### Plans

GET /plans

### Admin

POST /admin/login

GET /admin/users

POST /admin/users/update-plan

POST /admin/users/block

POST /admin/users/delete

POST /admin/users/reset-device

### AI

POST /generate

POST /generate-from-form

POST /generate-from-text

### License

POST /validate-license

### Health

GET /health

## Default Admin Login

Email:
[admin@dyanacore.com](mailto:admin@dyanacore.com)

Password:
admin123

## Environment Variables

PORT=10000

JWT_SECRET=your_secret_key

ADMIN_EMAIL=[admin@dyanacore.com](mailto:admin@dyanacore.com)

ADMIN_PASSWORD=admin123

OPENAI_API_KEY=your_openai_key

## Deployment

Build Command:

npm install

Start Command:

npm start

## Server

https://meesho-backend-ga8x.onrender.com

## Version

Dyana Core Seller Suite v2.0
