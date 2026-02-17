# TypeScript Best Practices

## Our Type Safety Philosophy

This project uses TypeScript in an exhaustive way to catch bugs at compile time rather than runtime. We leverage advanced TypeScript patterns to ensure that:

1. **All edge cases are handled** - When the backend adds new enum values or states, TypeScript will force us to handle them
2. **No implicit any types** - Every value has a known type
3. **Runtime errors are minimized** - Type guards validate external data
4. **Code is self-documenting** - Types serve as inline documentation

## Why We Use TypeScript This Way

For new frontend developers, TypeScript might seem verbose at first, but it provides immense value:

- **Catches bugs early**: Instead of finding bugs in production, TypeScript catches them while you code
- **Better IDE support**: Get accurate autocomplete and refactoring tools
- **Easier onboarding**: New developers can understand the codebase faster by reading types
- **Confident refactoring**: Change code without fear of breaking other parts
- **Automatic type updates**: When base types change, derived types using utility types automatically update

## The Power of Refactoring Safety

One of the biggest benefits of utility types is refactoring safety. Here's a real example:

```typescript
// Original User type from API
interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
}

// Derived types using utilities
type PublicUser = Omit<User, 'email'>
type UserSummary = Pick<User, 'id' | 'name'>
type EditableUser = Omit<User, 'id'>

// Later: Backend adds 'phoneNumber' and 'lastLogin' to User
interface User {
  id: string
  name: string
  email: string
  phoneNumber?: string // New field
  lastLogin: Date // New field
  role: 'admin' | 'user'
}

// ✅ All derived types automatically stay correct!
// PublicUser now includes phoneNumber but not email
// UserSummary still only has id and name
// EditableUser includes new fields but not id

// Without utility types, you'd need to manually update every derived type
```

## Core TypeScript Patterns

### 1. Discriminated Unions (Tagged Unions)

Instead of using multiple boolean flags, we use discriminated unions to represent mutually exclusive states:

```typescript
// ❌ Bad: Multiple flags that can be inconsistent
interface BadAuthState {
  isLoading: boolean
  isAuthenticated: boolean
  user?: User
  error?: Error
}

// ✅ Good: Discriminated union ensures valid state combinations
type AuthState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'authenticated'; user: User; token: string }
  | { status: 'unauthenticated' }
  | { status: 'error'; error: Error }

// Usage with exhaustive pattern matching
function getAuthMessage(state: AuthState): string {
  switch (state.status) {
    case 'idle':
      return 'Initializing...'
    case 'loading':
      return 'Checking authentication...'
    case 'authenticated':
      return `Welcome, ${state.user.name}!`
    case 'unauthenticated':
      return 'Please log in'
    case 'error':
      return `Error: ${state.error.message}`
    // TypeScript ensures all cases are handled
  }
}
```

### 2. Exhaustive Pattern Matching

We ensure all possible cases are handled, especially for backend enums:

```typescript
// From backend API (auto-generated in src/slices/api.ts)
type RoleEnum = 'team_lead' | 'analyst'

function getPermissions(role: RoleEnum): string[] {
  switch (role) {
    case 'team_lead':
      return ['read', 'write', 'delete', 'manage_team']
    case 'analyst':
      return ['read', 'write']
    default:
      // This ensures TypeScript errors if backend adds new roles
      const exhaustiveCheck: never = role
      throw new Error(`Unhandled role: ${exhaustiveCheck}`)
  }
}
```

### 3. Utility Types: Transform Don't Duplicate

Utility types are TypeScript's power tools that let us transform existing types without duplicating code. These type-level operations provide refactoring safety - when base types change, derived types automatically update.

```typescript
// ✅ Built-in utility types prevent duplication

// Pick: Select specific properties
type UserSummary = Pick<User, 'id' | 'name' | 'email'>
// If User adds a 'avatar' field to these props, UserSummary stays correct

// Omit: Remove specific properties
type PublicUser = Omit<User, 'password' | 'refreshToken'>
// If User adds new sensitive fields, we only need to update here

// Partial: Make all properties optional (great for updates)
type UserUpdate = Partial<User>

// Required: Make all properties required
type CompleteUser = Required<User>

// NonNullable: Remove null and undefined
type ValidUser = NonNullable<User | null | undefined> // User

// Extract/Exclude: Filter union types
type SuccessStatus = Extract<ApiStatus, 'success' | 'completed'>
type ErrorStatus = Exclude<ApiStatus, 'success' | 'completed'>

// Record: Create object types with consistent value types
type UserPermissions = Record<string, boolean>
// { [key: string]: boolean }

type RolePermissions = Record<'admin' | 'user' | 'guest', string[]>
// { admin: string[], user: string[], guest: string[] }

// Readonly: Prevent mutations
type Config = Readonly<{
  apiUrl: string
  timeout: number
}>

// ✅ Our custom utility types for common patterns

// Make specific properties optional (surgical precision)
type UserForm = WithOptional<User, 'id' | 'createdAt'>

// Deep partial for nested objects
type SettingsUpdate = DeepPartial<UserSettings>
// Can update nested properties: { theme: { colors: { primary: '#000' } } }

// Type extraction from functions
type ApiResponse = ReturnType<typeof fetchUser>
type UserData = Awaited<ApiResponse> // Unwraps Promise
```

**Real-world example: React component composition**

```typescript
// Parent component receives many props
interface ParentProps {
  user: User
  business: Business
  onUpdate: (data: any) => void
  theme: Theme
  locale: string
  className?: string
}

// Child only needs some props - Pick ensures consistency
type ChildProps = Pick<ParentProps, 'user' | 'business' | 'onUpdate'>

// Another child needs different props
type HeaderProps = Pick<ParentProps, 'user' | 'theme'> & {
  onLogout: () => void
}

// Form component needs partial user for editing
type UserFormProps = {
  initialValues: Partial<User>
  onSubmit: (data: User) => void
}

// If ParentProps or User changes, all derived types automatically update!

// Advanced: HOC (Higher-Order Component) pattern
type WithAuthProps<T> = T & {
  isAuthenticated: boolean
  user: User | null
}

// Usage
type ProfilePageProps = WithAuthProps<{
  profileId: string
  onEdit: () => void
}>
// Resulting type has all original props plus auth props
```

### 4. Type Guards for Runtime Safety

When dealing with external data (API responses, user input), we validate at runtime:

```typescript
// Type guard for API errors
function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).message === 'string'
  )
}

// Usage
try {
  const data = await fetchUser()
} catch (error) {
  if (isApiError(error)) {
    // TypeScript knows error has message property
    showToast(error.message)
  } else {
    showToast('An unexpected error occurred')
  }
}
```

### 5. Generic Loading States

We use a generic loading state pattern for all async operations:

```typescript
type LoadingState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

// Usage in a component
function UserProfile() {
  const [userState, setUserState] = useState<LoadingState<User>>({
    status: 'idle',
  })

  // Render based on state
  switch (userState.status) {
    case 'idle':
      return <Button onClick={loadUser}>Load Profile</Button>
    case 'loading':
      return <Spinner />
    case 'success':
      return <ProfileCard user={userState.data} />
    case 'error':
      return <ErrorMessage error={userState.error} />
  }
}
```

## Working with API Types

Our API types are auto-generated from the OpenAPI schema. Never edit `src/slices/api.ts` directly:

```typescript
// ❌ Bad: Don't modify generated types
// Don't edit src/slices/api.ts

// ✅ Good: Extend or wrap generated types
import { User } from '@/slices/api'

// Extend for frontend-specific needs
interface UserWithUI extends User {
  isSelected: boolean
  displayName: string
}

// Create subsets for forms
type UserFormData = Pick<User, 'name' | 'email'> & {
  confirmEmail: string
}
```

## Common Patterns and Examples

### Form Handling with Type Safety

```typescript
// Define form data type based on API types
type LoginForm = {
  email: string
  password: string
  rememberMe: boolean
}

// Type-safe form submission
async function handleLogin(data: LoginForm) {
  try {
    const response = await api.login({
      email: data.email,
      password: data.password,
    })

    if (response.success) {
      // TypeScript knows response.data exists
      saveToken(response.data.token)
    }
  } catch (error) {
    // Type-safe error handling
    const message = isApiError(error) ? error.message : 'Network error'
    showError(message)
  }
}
```

### Component Props with Utility Types

```typescript
// Base button props
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger'
  size: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  onClick: () => void
  children: React.ReactNode
}

// Specialized button that only needs some props
type IconButtonProps = Pick<ButtonProps, 'size' | 'onClick'> & {
  icon: IconType
  label: string // for accessibility
}

// Form submit button with loading state
type SubmitButtonProps = Omit<ButtonProps, 'onClick' | 'loading'> & {
  form: string
  submitting: boolean
}
```

## Advanced Utility Type Patterns

### Conditional Types and Template Literals

```typescript
// Conditional types for advanced transformations
type IsArray<T> = T extends any[] ? true : false
type ArrayElement<T> = T extends (infer E)[] ? E : never

// Template literal types for string manipulation
type EventName<T extends string> = `on${Capitalize<T>}`
type ClickEvent = EventName<'click'> // 'onClick'

// Mapped types with template literals
type Getters<T> = {
  [K in keyof T as `get${Capitalize<K & string>}`]: () => T[K]
}

interface User {
  name: string
  age: number
}
type UserGetters = Getters<User>
// { getName: () => string; getAge: () => number }
```

### Building Complex Types from Simple Ones

```typescript
// Combine utility types for powerful transformations
type ReadonlyPartialPick<T, K extends keyof T> = Readonly<Partial<Pick<T, K>>>

// Real use case: Form draft state
type DraftUser = ReadonlyPartialPick<User, 'name' | 'email'>
// All picked fields are optional and readonly

// Union to intersection converter
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never

// Practical example: Merging feature flags
type FeatureFlags =
  | { darkMode: boolean }
  | { betaFeatures: boolean }
  | { analytics: boolean }

type AllFlags = UnionToIntersection<FeatureFlags>
// { darkMode: boolean; betaFeatures: boolean; analytics: boolean }
```

### Important: Utility Types are Compile-Time Only

Utility types are purely compile-time constructs:

```typescript
// ❌ Common misconception: Utility types don't validate at runtime
type ValidEmail = string & { __brand: 'email' }

function processEmail(email: ValidEmail) {
  // TypeScript ensures type safety at compile time
  // But the actual runtime value is just a string
}

// ✅ Combine utility types with runtime validation
function isValidEmail(value: unknown): value is ValidEmail {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// Use together for complete safety
function safeProcessEmail(input: unknown) {
  if (isValidEmail(input)) {
    processEmail(input) // Type-safe at compile AND runtime
  }
}
```

## Best Practices

### 1. Let TypeScript infer when possible

```typescript
// ❌ Redundant type annotation
const name: string = 'John'

// ✅ Let TypeScript infer
const name = 'John'

// ✅ Be explicit when not obvious
const users: User[] = []
```

### 2. Use `unknown` instead of `any` for external data

```typescript
// ❌ Bad: any disables all type checking
function processData(data: any) {
  return data.value // No type checking!
}

// ✅ Good: unknown requires type checking
function processData(data: unknown) {
  if (isValidData(data)) {
    return data.value // Type safe after guard
  }
  throw new Error('Invalid data')
}
```

### 3. Prefer type inference with `as const`

```typescript
// ❌ Verbose enum
enum Status {
  Idle = 'IDLE',
  Loading = 'LOADING',
  Success = 'SUCCESS',
}

// ✅ Const assertion
const STATUS = {
  Idle: 'IDLE',
  Loading: 'LOADING',
  Success: 'SUCCESS',
} as const

type Status = (typeof STATUS)[keyof typeof STATUS]
```

### 4. Document complex types

```typescript
/**
 * Represents a paginated API response
 * @template T The type of items in the page
 */
type PagedResponse<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
```

## Custom Utility Types Reference

### WithOptional - Make specific properties optional

```typescript
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
```

### DeepPartial - Deep partial for nested objects

```typescript
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
```

### StrictOmit - Strict omit that errors on non-existent keys

```typescript
type StrictOmit<T, K extends keyof T> = Omit<T, K>
```

### UnionToIntersection - Union to intersection converter

```typescript
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never
```

### RequiredKeys - Get required keys from a type

```typescript
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]
```

### ApiResult - API response wrapper

```typescript
type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

## TypeScript Configuration

Our `tsconfig.json` uses strict settings:

```json
{
  "compilerOptions": {
    "strict": true, // Enable all strict checks
    "noImplicitAny": true, // Error on implicit any
    "strictNullChecks": true, // Null/undefined checking
    "noUnusedLocals": true, // Error on unused variables
    "noUnusedParameters": true, // Error on unused parameters
    "noImplicitReturns": true, // Ensure all paths return
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## ESLint Configuration for Exhaustiveness

Add to your ESLint config:

```json
{
  "rules": {
    "@typescript-eslint/switch-exhaustiveness-check": "error"
  }
}
```

## Resources for Learning

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) - Official documentation
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/) - Comprehensive guide
- [Type Challenges](https://github.com/type-challenges/type-challenges) - Practice advanced patterns

Remember: TypeScript is a tool to help us write better code. Start with basic types and gradually adopt advanced patterns as you become comfortable.
