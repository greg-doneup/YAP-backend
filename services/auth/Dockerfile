FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install --omit=dev

# Install TypeScript globally for compilation
RUN npm install -g typescript

# Copy source code
COPY . .

# Create the dist directory and compile TypeScript
RUN mkdir -p dist
RUN tsc --outDir dist --rootDir src --target es2020 --module commonjs --declaration false --strict false --esModuleInterop true --skipLibCheck true --forceConsistentCasingInFileNames false src/index.ts src/routes/auth.ts src/utils/database.ts src/utils/securityValidator.ts src/utils/auditLogger.ts src/middleware/security.ts src/middleware/requireAuth.ts

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "dist/index.js"]
