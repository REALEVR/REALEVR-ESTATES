# RealEVR Estates - Real Estate Platform

Acomprehensive real estate platform built for the Ugandan market, featuring virtual tours, agent management, and secure payment processing.

## Project Overview

RealEVR Estates is a modern real estate platform that revolutionizes property discovery through immersive virtual tours, secure payment processing, and comprehensive agent management. Built with React/TypeScript frontend and Node.js backend, it provides a seamless experience for property seekers, agents, and administrators.

## Key Features

### Property Management
- **Virtual Tours**: 360° immersive property experiences
- **Property Categories**: BnB, Rental Units, For Sale, Bank Sales, Furnished Houses
- **Advanced Details**: Construction year, building age, property condition
- **View Tracking**: Monitor property popularity and engagement

### User Management
- **Multi-Role System**: Normal users, Agents, Administrators
- **Agent Subscriptions**: Professional and Enterprise plans
- **Secure Authentication**: Session-based authentication with Passport.js
- **Profile Management**: User profiles and preferences

### Payment System
- **Agent Subscriptions**: Monthly billing (50K-100K UGX)
- **Pay-Per-View**: 15,000 UGX for rental property tours
- **Flutterwave Integration**: Secure payment processing
- **Payment Tracking**: Comprehensive payment analytics

### Security & Trust
- **Agent Verification**: License and identity verification
- **Property Verification**: Ownership and location validation
- **SSL Encryption**: Secure data transmission
- **Fraud Protection**: Advanced fraud detection systems

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Wouter** for routing
- **React Query** for state management
- **shadcn/ui** component library

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **DynamoDB** for scalable data storage
- **Passport.js** for authentication
- **AWS S3** for file storage

### Payment & Infrastructure
- **Flutterwave** for payment processing
- **AWS DynamoDB** for database
- **AWS S3** for media storage
- **Session-based authentication**

## Project Structure

```
REALEVR-ESTATES/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── contexts/      # React contexts
│   │   └── lib/           # Utility functions
│   └── public/            # Static assets
├── server/                # Backend Node.js application
│   ├── auth.ts           # Authentication setup
│   ├── routes.ts         # API routes
│   ├── storage.ts        # Database operations
│   └── utils/            # Server utilities
├── shared/               # Shared TypeScript types
└── uploads/              # File uploads directory
```

## Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- AWS account (for DynamoDB and S3)
- Flutterwave account (for payments)

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd REALEVR-ESTATES
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=5001
   SESSION_SECRET=your-session-secret
   
   # AWS Configuration
   AWS_ACCESS_KEY_ID=your-aws-access-key
   AWS_SECRET_ACCESS_KEY=your-aws-secret-key
   AWS_REGION=us-east-1
   
   # Flutterwave Configuration
   VITE_FLUTTERWAVE_PUBLIC_KEY=your-flutterwave-public-key
   FLUTTERWAVE_SECRET_KEY=your-flutterwave-secret-key
   
   # Database Configuration
   DYNAMODB_TABLE_NAME=realevr-estates
   ```

4. **Database Setup**
   ```bash
   # Run DynamoDB migrations
   npm run migrate
   
   # Seed initial data
   npm run seed
   ```

5. **Start the server**
   ```bash
   npm run dev
   ```

### Frontend Setup

1. **Navigate to client directory**
   ```bash
   cd client
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

## 📊 Database Schema

### Users Table
```typescript
interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: 'normal' | 'agent' | 'admin';
  subscriptionPlan?: 'basic' | 'professional' | 'enterprise';
  subscriptionStatus?: 'active' | 'inactive' | 'expired';
  phoneNumber?: string;
  company?: string;
  license?: string;
  paymentId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Properties Table
```typescript
interface Property {
  id: string;
  title: string;
  description: string;
  location: string;
  price: number;
  currency: string;
  bedrooms: number;
  bathrooms: number;
  squareMeters: number;
  category: 'bnb' | 'rental_units' | 'for_sale' | 'bank_sale' | 'furnished_houses';
  propertyType: string;
  imageUrl: string;
  images: string[];
  amenities: string[];
  hasTour: boolean;
  tourUrl?: string;
  viewCount: number;
  isAvailable: boolean;
  isFeatured: boolean;
  yearOfConstruction?: number;
  buildingAge?: number;
  propertyCondition?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## Authentication & Authorization

### User Roles
- **Normal Users**: Browse properties, view tours (with payment for rentals)
- **Agents**: List properties, manage listings, access analytics
- **Admins**: Full platform access, user management, system configuration

### Authentication Flow
1. User registration/login via email/password
2. Session creation with secure cookies
3. Role-based route protection
4. Automatic session renewal

## Payment Integration

### Agent Subscriptions
- **Basic Plan**: Free (limited access)
- **Professional Plan**: 50,000 UGX/month
- **Enterprise Plan**: 100,000 UGX/month

### Tour Payments
- **Rental Properties**: 15,000 UGX per virtual tour
- **Other Properties**: Free access
- **Payment Methods**: Cards, Mobile Money, Bank Transfers

### Payment Security
- SSL encryption for all transactions
- PCI DSS compliant payment processing
- Fraud detection and monitoring
- Secure payment verification

## 🎨 UI/UX Features

### Property Cards
- Clickable design for better UX
- View count display
- Payment integration for rentals
- Responsive design for all devices

### Virtual Tours
- 360° immersive experiences
- Mobile-optimized viewing
- Loading states and error handling
- Payment-gated access for rentals

### Admin Dashboard
- Comprehensive analytics
- User and property management
- Payment tracking
- System monitoring

## Responsive Design

The platform is fully responsive and optimized for:
- Desktop computers
- Tablets
- Mobile phones
- Various screen sizes and orientations

## API Endpoints

### Authentication
- `POST /api/register` - User registration
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/user` - Get current user

### Properties
- `GET /api/properties` - Get all properties
- `GET /api/properties/featured` - Get featured properties
- `GET /api/properties/popular` - Get popular properties
- `POST /api/properties` - Create new property (agents only)

### Payments
- `POST /api/verify-tour-payment` - Verify tour payment
- `POST /api/verify-subscription-payment` - Verify subscription payment
- `GET /api/tour-payments` - Get tour payment history (admin)

### Admin
- `GET /api/admin/users` - Get all users (admin only)
- `GET /api/admin/agents` - Get agent analytics (admin only)
- `POST /api/admin/users/:id/update` - Update user (admin only)

## Deployment

### Production Environment
1. **Build the frontend**
   ```bash
   cd client
   npm run build
   ```

2. **Set up production environment variables**
   ```env
   NODE_ENV=production
   PORT=5001
   SESSION_SECRET=your-production-session-secret
   ```

3. **Deploy to your preferred hosting service**
   - AWS EC2
   - Heroku
   - DigitalOcean
   - Vercel (frontend)

### Environment Variables
- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port
- `SESSION_SECRET`: Session encryption secret
- `AWS_*`: AWS configuration
- `FLUTTERWAVE_*`: Payment processing configuration

## Testing

### Running Tests
```bash
# Backend tests
npm test

# Frontend tests
cd client
npm test
```

### Test Coverage
- Unit tests for utility functions
- Integration tests for API endpoints
- Component tests for React components
- E2E tests for critical user flows

## Performance Optimization

### Frontend
- Code splitting and lazy loading
- Image optimization
- Caching strategies
- Bundle size optimization

### Backend
- Database query optimization
- Caching with Redis (optional)
- Rate limiting
- Compression middleware

## Security Measures

### Data Protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection

### Authentication Security
- Password hashing with scrypt
- Session management
- Rate limiting on auth endpoints
- Secure cookie configuration

### Payment Security
- PCI DSS compliance
- Encrypted payment data
- Fraud detection
- Secure payment verification

## Support & Documentation

### Help Resources
- **Help Center**: `/help` - FAQ and support
- **Contact Us**: `/contact` - Direct support
- **Trust & Safety**: `/trust-safety` - Security information

### Documentation
- API documentation
- User guides
- Admin documentation
- Developer documentation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Code Style
- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting
- Conventional commits for commit messages

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- **Flutterwave** for payment processing
- **AWS** for cloud infrastructure
- **React** and **Node.js** communities
- **Tailwind CSS** for styling framework

## Contact

- **Email**: info@realevr.com
- **Phone**: +256 771 891 323
- **Website**: https://realevr.com

---

**RealEVR Estates** - Revolutionizing real estate discovery in Uganda through technology and innovation.
