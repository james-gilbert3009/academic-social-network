# TSI CONNECT — Academic Social Networking Platform (Bachelor Thesis Documentation)

## 1. Project Overview

**TSI CONNECT** is a MERN-stack academic social networking platform developed as a Bachelor thesis project for students and academic staff. The system is designed to support **academic networking**, **knowledge sharing**, and **lightweight collaboration** inside a university-like community (TSI.lv-inspired visual identity and interaction patterns).

From a problem perspective, the project addresses the gap between generic social networks (not academically structured, poor role differentiation) and institutional systems (often rigid, limited social interaction). TSI CONNECT introduces:

- **Academic identity** through structured profiles (faculty, program, skills, interests) and role badges (student/lecturer/professor).
- **Content sharing** through categorized posts (question, research, announcement, study, event, general).
- **Relationship building** via a follow/connect mechanism and mutual “connection” (friend) state.
- **Engagement feedback** through likes, comments, and a notification subsystem.

**Target users**:

- Students seeking peers, study material, and academic discussions.
- Lecturers/professors publishing announcements, research-related posts, and community guidance.

**Thesis scope**:

- Full-stack web system implementation with authentication, CRUD operations, media uploads, relational behaviors (follow/like/comment), and UI/UX design aligned with an academic theme.
- Thesis-level security and validation measures appropriate for a prototype/demonstration system.

## 2. Project Objectives

### 2.1 Primary objectives

- Implement a working academic social networking application with clear separation of client and server responsibilities.
- Provide identity and access control using JWT-based authentication.
- Provide a complete user flow from registration → profile setup → feed interaction.

### 2.2 Functional objectives (implemented)

- Account creation with role selection (student/lecturer/professor).
- Login using either **email or username**.
- Profile setup and editing with:
  - academic fields (bio, faculty, program, skills, interests)
  - profile picture upload/removal
  - profile completeness computation and gating
- Post creation with category selection and optional image upload.
- Post interactions:
  - like/unlike (toggle)
  - comments CRUD (add; delete by comment owner or post owner)
  - post caption editing (text only)
  - post deletion with best-effort cleanup
- Follow/connect system (follow/unfollow) with derived “friend/connection” status.
- Notifications for follow/like/comment/post events, including read/unread state.
- User discovery through search with role filtering.

## 3. Technology Stack (as implemented in the repository)

### 3.1 Frontend

- **React (v19)**: Component-based UI implementation using local component state.
- **Vite**: Development server and build tooling (`npm run dev` / `vite build`).
- **React Router DOM (v7)**: Routing with nested route guards (`RequireAuth`, `RequireProfileComplete`).
- **Axios**: REST client with shared instance and Authorization header synchronization.
- **react-icons**: Iconography for roles, categories, and actions.

### 3.2 Backend

- **Node.js + Express (v5)**: REST API server; route logic implemented inline inside route files (no separate controller/service layer).
- **MongoDB + Mongoose (v8)**: Document database with ODM schemas for `User`, `Post`, and `Notification`.
- **JWT (jsonwebtoken)**: Stateless authentication; token payload includes `{ id, role }`.
- **Multer**: Local file uploads to an `uploads/` directory; images served statically via `/uploads/*`.
- **bcryptjs**: Password hashing and verification.
- **CORS**: Allowlist logic that permits a configured `CORS_ORIGIN` and any `http://localhost:<port>` (Vite development).

## 4. System Architecture

### 4.1 Architectural style

The project follows a classic MERN architecture:

- **Client (React)** renders pages, manages user interactions, and communicates through a REST API.
- **Server (Express)** exposes `/api/*` endpoints for authentication, profiles, posts, users, and notifications.
- **Database (MongoDB)** stores persistent domain data.
- **File storage (local filesystem)** stores uploaded images referenced by URL paths (e.g., `/uploads/<filename>`).

### 4.2 Client–server communication model

All business operations (authentication, profile read/update, post feed, follow toggles, notification reads) use Axios requests to the API base URL:

- `frontend/src/api.js` defines `API_BASE_URL` (defaults to `http://localhost:5000`) and a shared `api` instance.
- The **Authorization header** is set as `Bearer <token>` and kept in sync through `setAuthToken(...)`.

### 4.3 REST API structure (actual mounted routes)

The backend mounts these route groups in `backend/server.js`:

- `/api/auth` → `backend/routes/auth.js`
- `/api/profile` → `backend/routes/profile.js`
- `/api/users` → `backend/routes/users.js`
- `/api/posts` → `backend/routes/posts.js`
- `/api/notifications` → `backend/routes/notifications.js`

### 4.4 Local uploads flow

1. Client submits `multipart/form-data` containing an image field (`profileImage` for profile, `image` for posts).
2. Server uses Multer to store files into `uploads/`.
3. Server saves the file reference into MongoDB as a **relative path** beginning with `/uploads/...`.
4. Server serves the directory via:

- `app.use("/uploads", express.static("uploads"))`

5. Client converts relative upload URLs into absolute URLs for display by prefixing `API_BASE_URL`.

### 4.5 JWT authentication flow (implementation-level)

- Registration/login generates a token:
  - payload: `{ id: user._id, role: user.role }`
  - expiry: `1d`
- Protected routes use `requireAuth` middleware (`backend/middleware/auth.js`) which expects:
  - `Authorization: Bearer <token>`
  - attaches `req.user = { id, role }` and `req.userId` (alias)
- Frontend route protection:
  - `RequireAuth` redirects unauthenticated users to `/login`.
  - `RequireProfileComplete` redirects authenticated but incomplete profiles to `/profile-setup` (unless `skipProfileSetup=1`).

## 5. Folder Structure (responsibilities grounded in this codebase)

### 5.1 Backend (`backend/`)

- `server.js`
  - Express initialization, JSON parsing, static uploads serving, CORS allowlist, route mounting, MongoDB connection.
- `routes/`
  - Route definitions and inline business logic (no separate controller/services layer).
  - `auth.js`: registration/login/reset flows.
  - `profile.js`: profile read/update, profile completeness recomputation, local image deletion on replacement/removal.
  - `users.js`: search, follow system, follower/following lists, mutual and connections endpoints, account deletion cleanup.
  - `posts.js`: feed, create/edit/delete post, like toggle, comment CRUD, notification generation/cleanup.
  - `notifications.js`: list + mark read operations.
- `models/`
  - Mongoose schemas: `User`, `Post` (with embedded comment schema), `Notification`.
- `middleware/`
  - `auth.js`: JWT parsing and verification (`requireAuth`).
- `utils/`
  - `isProfileComplete.js`: profile completeness computation based on required core fields.
- `uploads/`
  - Local filesystem folder created at runtime (if missing) and served statically.

### 5.2 Frontend (`frontend/`)

- `src/main.jsx`
  - React entrypoint; wraps `App` with `BrowserRouter`.
- `src/App.jsx`
  - Route configuration and nested guards:
    - public: `/login`, `/register`, `/forgot-password`
    - authenticated: `/profile-setup`, `/profile`, `/profile/:userId`
    - authenticated + profile complete: `/feed`
- `src/api.js`
  - Axios instance configuration, base URL, Authorization header management.
- `src/api/`
  - Small wrapper modules mapping directly to backend endpoints:
    - `posts.js`, `profile.js`, `users.js`, `notifications.js`
- `src/pages/`
  - Page-level orchestration: data loading, modals, state composition.
  - `Feed.jsx`: feed retrieval, category filtering, create/edit/delete flows.
  - `Profile.jsx`: own vs member profile view, follow/connect logic, profile edit flows, account deletion.
  - `ProfileSetup.jsx`: onboarding form and “complete later” option.
  - `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`
- `src/components/`
  - Reusable UI building blocks:
    - `AppHeader`: responsive top bar with drawer behavior.
    - `UserSearch`: debounced user search with role filter.
    - `NotificationsDropdown`: polling + dropdown interactions.
    - `CreatePostForm`, `FeedPostCard`, `PostDetailsModal`, `ProfilePostCard`
    - `ProfileAvatar`, `ProfileForm`, `FollowListModal`, `ConfirmDialog`, `RoleBadge`
- `src/index.css`, `src/App.css`
  - Global theme tokens (light academic theme, blue header) and component/layout styles.

## 6. Database Design (Mongoose schemas and relationships)

### 6.1 `User` schema (`backend/models/User.js`)

**Identity and authentication**

- `name: String (required)`
- `username: String (required, unique, lowercase, trimmed)`
- `email: String (required, unique, lowercase, trimmed)`
- `password: String (required, bcrypt hash)`
- `role: String enum ["student","lecturer","professor","admin"] (default "student")`
- `birthdate: Date | null`

**Academic profile**

- `bio: String (default "")`
- `faculty: String (default "")`
- `program: String (default "")`
- `skills: [String] (default [])`
- `interests: [String] (default [])`
- `profileImage: String (default "")`  
  Stores a relative upload path such as `/uploads/<filename>` (or empty string).
- `isProfileComplete: Boolean (default false)`  
  Updated based on `utils/isProfileComplete.js`.

**Social graph**

- `followers: [ObjectId(User)]`
- `following: [ObjectId(User)]`

**Password reset (thesis demo flow)**

- `resetToken: String | null`
- `resetTokenExpiry: Date | null`

**Timestamps**

- `createdAt`, `updatedAt` via `{ timestamps: true }`.

### 6.2 `Post` schema (`backend/models/Post.js`)

- `author: ObjectId(User) (required)`
- `category: String enum ["question","research","announcement","study","event","general"] (default "general")`
- `content: String (trimmed, maxLength 1000, default "")`
- `image: String (default "")`  
  Stores relative upload path (e.g., `/uploads/...`) or empty string.
- `likes: [ObjectId(User)]` (default `[]`)  
  Implements like toggling by membership test and push/pull.
- `comments: [commentSchema]` (default `[]`)

Embedded `commentSchema` fields:

- `user: ObjectId(User) (required)`
- `text: String (trimmed, maxLength 1000, required)`
- `createdAt: Date (default now)`

### 6.3 `Notification` schema (`backend/models/Notification.js`)

- `recipient: ObjectId(User) (required)`  
  The user receiving the notification.
- `sender: ObjectId(User) (required)`  
  The user whose action generated the notification.
- `type: String enum ["follow","follow_back","friend","like","comment","post"] (required)`
- `post: ObjectId(Post) | null` (default null)  
  Used for like/comment/post notifications.
- `commentText: String (trim, maxLength 1000, default "")`  
  Used for comment notifications.
- `isRead: Boolean (default false)`
- `createdAt`, `updatedAt` timestamps.

### 6.4 Relationships summary (ER-level)

- A `User` **creates** many `Post` documents (`Post.author → User._id`).
- A `Post` contains many embedded `comments`, each comment references a `User`.
- A `Notification` references:
  - `recipient` (User)
  - `sender` (User)
  - optionally a `post` (Post)
- The social graph is represented through arrays:
  - `User.following` and `User.followers`.

## 7. Authentication & Authorization

### 7.1 Registration (`POST /api/auth/register`)

Implemented validations and behavior:

- Requires `name`, `username`, `email`, `password`.
- Normalizes:
  - `email` → lowercase + trim
  - `username` → lowercase + trim
- Enforces uniqueness on both email and username.
- Role selection allowed only for: `student`, `lecturer`, `professor` (admin is not assignable at registration).
- Password stored as bcrypt hash (`bcrypt.hash(password, 10)`).
- Returns:
  - JWT token (`expiresIn: "1d"`)
  - minimal user payload including `isProfileComplete`.

Frontend mapping:

- `Register.jsx` calls `/api/auth/register`, saves `token`, and navigates to `/profile-setup`.

### 7.2 Login (`POST /api/auth/login`)

Implemented behavior:

- Accepts `identifier` which can be either **email or username**.
- Finds user with `$or: [{ email }, { username }]` using lowercase normalized identifier.
- Verifies bcrypt password.
- Returns JWT (`1d`) and user payload.

Frontend mapping:

- `Login.jsx` saves `token` and navigates to `/feed`.

### 7.3 Protected routes (server-side)

All protected endpoints rely on `requireAuth`:

- Requires correct Authorization header format.
- Rejects expired/invalid token with HTTP 401.
- Attaches `req.user.id` and `req.user.role` for downstream logic.

### 7.4 Frontend route guards (client-side)

The React router is structured to enforce two separate constraints:

- **Authentication requirement** (`RequireAuth`):
  - If `localStorage.token` is absent, the user is redirected to `/login`.
  - The attempted path is stored in router state (`state.from`) to support improved navigation flows.
- **Profile completeness requirement** (`RequireProfileComplete`):
  - By default, the guard calls `GET /api/profile/me` and checks `user.isProfileComplete`.
  - If incomplete, it redirects the user to `/profile-setup`.
  - A deliberate “thesis demo” bypass exists: if `localStorage.skipProfileSetup === "1"`, the user is allowed to access `/feed` even with an incomplete profile (set by the “Complete later” button in `ProfileSetup.jsx`).

### 7.5 Password reset (demo flow)

The backend implements a two-step flow designed for demonstrational purposes:

- `POST /api/auth/forgot-password`:
  - Generates a random token (`crypto.randomBytes(20)`), stores it in `User.resetToken` with a 15-minute expiry (`resetTokenExpiry`), and **returns the token in the API response**.
  - This is explicitly not production behavior (a real system would email the token and never return it).
- `POST /api/auth/reset-password`:
  - Verifies the token and expiry.
  - Updates the password (bcrypt hash) and clears reset fields.

Frontend mapping:

- `ForgotPassword.jsx` requests the token, displays it, and submits it back with `newPassword`.

## 8. Profile System

### 8.1 Profile endpoints (actual)

- `GET /api/profile/me` (protected)
  - Returns the authenticated user without password.
  - Recomputes profile completeness via `utils/isProfileComplete.js` and updates `User.isProfileComplete` if out of sync.
  - Adds derived counters into the returned object:
    - `followersCount`, `followingCount`
    - `friendsCount` computed as mutual follow (`followers ∩ following`)
- `GET /api/profile/:userId` (protected)
  - Returns another user’s profile (password excluded).
  - Augments response with relationship flags relative to the viewer:
    - `isFollowing`, `isFollower`, `isFriend`
  - Adds count fields (`followersCount`, `followingCount`, `friendsCount`).
- `PUT /api/profile/me` (protected; `multipart/form-data` supported)
  - Accepts updates for `name`, `bio`, `faculty`, `program`, `skills`, `interests`.
  - Supports photo upload: `profileImage` stored as `/uploads/<filename>`.
  - Supports photo removal through `removeProfileImage=true`, clearing `profileImage`.
  - Performs **best-effort file deletion** of the previous image if it was local (`/uploads/...`) and is replaced or removed.
  - Recomputes and persists `isProfileComplete` using the merged state.

### 8.2 Profile completeness logic (implemented constraint)

Profile completeness is computed in `backend/utils/isProfileComplete.js`. The profile is considered complete only when all required fields are present:

- `name` non-empty (trimmed)
- `bio` non-empty
- `faculty` non-empty
- `program` non-empty
- `skills` contains at least one non-empty entry
- `interests` contains at least one non-empty entry

This design ensures that **photo-only updates do not mark a profile as complete**, matching the code’s intent.

### 8.3 Profile setup flow (frontend)

After registration, the user is redirected to `/profile-setup` (`Register.jsx` → `navigate("/profile-setup")`). The onboarding page:

- Loads the current profile (`GET /api/profile/me`) and pre-fills fields when possible.
- Submits a `FormData` payload to `PUT /api/profile/me` including:
  - `name`, `faculty`, `program`, `bio`, `skills` (comma string), `interests` (comma string)
  - optional file `profileImage`
- Includes a **“Complete later”** action:
  - sets `localStorage.skipProfileSetup = "1"`
  - navigates to `/feed`, which is then allowed by `RequireProfileComplete`.

### 8.4 Own profile vs member profile

`Profile.jsx` operates in two modes:

- **Own profile** (`/profile`):
  - Enables editing of profile fields via `ProfileForm`.
  - Enables profile picture menu (view/change/remove) via `ProfileAvatar`.
  - Enables post creation modal and deletion of own posts.
  - Shows “Connections” as mutual follow.
  - Provides “Delete account” functionality.
- **Member profile** (`/profile/:userId`):
  - Read-only profile fields.
  - Follow/connect button whose label is derived from the relationship:
    - `Connect`, `Connect Back`, `Following`, or `Connected`.
  - Shows “Mutual connections” count computed from shared following.

### 8.5 Role badges (UI differentiation)

The UI displays role identity consistently using `RoleBadge.jsx`, mapping roles to both:

- **labels**: Student, Lecturer, Professor, Admin
- **icons**: `FaUserGraduate`, `MdMenuBook`, `FaChalkboardTeacher`, `FaUserShield`

The role badge is shown in:

- feed post headers (`FeedPostCard`)
- post details modal (`PostDetailsModal`)
- search results (`UserSearch`)
- follow list modal (`FollowListModal`)
- profile header (`ProfileForm`)

## 9. Posts System

### 9.1 Post creation (`POST /api/posts`)

Backend behavior:

- Endpoint accepts `multipart/form-data` with:
  - `content` (optional) and/or `image` (optional)
  - `category` (validated against the allowed set)
- Validation rule: **a post must contain at least text or an image**.
- Image constraints:
  - allowed MIME: `image/jpeg`, `image/png`, `image/webp`
  - max size: 5MB
  - stored to `uploads/` and saved as `/uploads/<filename>`

Frontend behavior:

- `CreatePostForm.jsx` provides:
  - category selector (question/research/announcement/study/event/general)
  - caption textarea (max 1000)
  - client-side image validation (MIME/ext + size 5MB)
  - preview rendering via `URL.createObjectURL`
  - submission via `createPost(FormData)`

### 9.2 Feed retrieval (`GET /api/posts`)

- Returns all posts (no pagination), sorted by `createdAt DESC`.
- Populates:
  - `author` with `name username profileImage role`
  - `comments.user` with `name username profileImage role`

Frontend usage:

- `Feed.jsx` loads:
  - `GET /api/profile/me` to identify the current user
  - `GET /api/posts` for the feed list
- Implements a category filter UI (client-side filtering).

### 9.3 Profile posts (`GET /api/posts/user/:userId`)

- Returns posts for a given author, newest first, with the same population behavior.

Frontend usage:

- `Profile.jsx` loads posts for the displayed profile and presents them in a grid via `ProfilePostCard`.

### 9.4 Like system (`PUT /api/posts/:id/like`)

- Implements like/unlike as a toggle based on whether the user’s id exists in `post.likes`.
- Returns the populated post after update.

Frontend:

- `Feed.jsx` calls `toggleLike` and replaces the updated post in state.
- `PostDetailsModal.jsx` performs a like action and refreshes notifications via a global event.

### 9.5 Comment system

Implemented endpoints:

- `POST /api/posts/:id/comments`:
  - Adds a new comment with `{ user: req.user.id, text }`.
  - Returns updated populated post.
- `DELETE /api/posts/:postId/comments/:commentId`:
  - Allows deletion if the requester is either:
    - the comment owner, or
    - the post owner
  - Returns updated populated post.

Frontend:

- Comments are primarily handled inside `PostDetailsModal.jsx` with an inline composer and an in-modal delete confirmation (`ConfirmDialog`).
- `FeedPostCard.jsx` shows up to two preview comments.

### 9.6 Edit and delete post logic

- `PUT /api/posts/:id`:
  - Allows the author to change caption text only.
  - Prevents “empty” posts when there is no image (caption cannot become empty if no image exists).
- `DELETE /api/posts/:id`:
  - Author-only deletion.
  - Best-effort file deletion for the post image when stored locally.
  - Best-effort cleanup of `Notification` documents that reference the deleted post.

Frontend:

- `Feed.jsx` implements caption editing as a modal that explicitly communicates the constraint: “The image stays the same.”
- Deletion uses `ConfirmDialog` and removes the post from local state.

## 10. Notification System

### 10.1 Notification endpoints

- `GET /api/notifications`:
  - Returns notifications for the logged-in user, newest first.
  - Populates:
    - `sender` with `name username profileImage role`
    - `post` with `content image`
- `PUT /api/notifications/:id/read`:
  - Recipient-only authorization.
  - Marks a single notification as read.
- `PUT /api/notifications/read-all`:
  - Bulk marks all unread notifications as read.

### 10.2 Notification generation (actual implemented types)

Notifications are created in multiple subsystems:

- **Follow/connect** (`PUT /api/users/:id/follow`):
  - On follow:
    - if the target was not already following the actor → creates `type="follow"`
    - if the target was already following the actor (follow-back) → creates:
      - `type="follow_back"` (to the target)
      - `type="friend"` to both parties (two inserted documents)
  - On unfollow:
    - best-effort cleanup deletes follow/follow_back/friend notifications between the pair.
- **Post creation** (`POST /api/posts`):
  - Notifies all followers of the author with `type="post"` and `post=<postId>`.
- **Like** (`PUT /api/posts/:id/like`):
  - On like (not unlike), and only if the liker is not the author:
    - creates `type="like"` if no identical notification exists already.
  - On unlike:
    - deletes like notifications for the pair and post.
- **Comment** (`POST /api/posts/:id/comments`):
  - Notifies the post author (unless self-comment) with `type="comment"`, including `commentText`.
  - On comment delete:
    - best-effort deletes comment notifications matching `(recipient=post.author, sender=commentUserId, post, commentText)`.

### 10.3 Frontend dropdown behavior and polling strategy

`NotificationsDropdown.jsx` implements a pragmatic thesis-level approach:

- Loads notifications on mount to render an unread badge.
- Polls every **45 seconds** while mounted (`setInterval`) to refresh the list.
- Refreshes again when the dropdown is opened.
- Listens for a custom event (`notifications:refresh`) so other parts of the UI (e.g., follow toggle, like, comment delete) can trigger refresh without a global state library.
- Supports:
  - optimistic marking as read on click
  - “Mark all as read”
  - navigation rules:
    - follow/follow_back/friend → navigate to sender profile
    - like/comment/post → navigate to `/feed` and optionally request opening a post via route state (`openPostId`)

### 10.4 Notification cleanup logic (important thesis-level detail)

Unlike many prototypes, this implementation includes multiple best-effort cleanup paths to keep notifications consistent with reversible actions:

- unlike removes like notifications
- comment delete removes comment notifications (matched by commentText)
- unfollow removes follow/friend related notifications
- post delete removes post-linked notifications

These decisions improve perceived correctness without requiring real-time messaging infrastructure.

## 11. User Discovery Features

### 11.1 Search (`GET /api/users/search`)

Backend:

- Query: `/api/users/search?q=<keyword>&role=<optional>`
- Case-insensitive regex match on `name` or `username`.
- Optional role filter: ignored if `role` is missing or `all`.
- Returns only safe fields:
  - `_id name username role profileImage faculty program`
- Limits results to 10 and sorts by name.

Frontend:

- `UserSearch.jsx` implements:
  - 300ms debounce
  - request ordering via a monotonically increasing `requestId` to ignore stale responses
  - role filter drop-down
  - results in a dropdown card; clicking opens `/profile/:id`.

### 11.2 Follow/connect model and mutuality

Implemented follow endpoints:

- `PUT /api/users/:id/follow` toggles follow/unfollow.
- `GET /api/users/:id/followers` returns follower list with safe fields.
- `GET /api/users/:id/following` returns following list with safe fields.

Mutuality endpoints:

- `GET /api/users/:id/mutual`:
  - intersection of `me.following` and `target.following`.
- `GET /api/users/:id/connections`:
  - if `:id === me`: connections = mutual follow (`followers ∩ following`)
  - else: “mutual connections” = shared following (`me.following ∩ target.following`)

Frontend presentation:

- `Profile.jsx` exposes these lists through `FollowListModal`, including inline connect toggles inside the modal.

## 12. UI/UX Design (implemented TSI-inspired academic theme)

### 12.1 Visual identity and theme tokens

The UI uses a white/light academic palette with a strong blue primary identity:

- Theme variables are defined in `frontend/src/index.css`:
  - `--primary: #003566` and `--header-bg: #003566`
  - neutral background `--bg: #f8fafc`, border `--border: #e2e8f0`
  - danger `--danger: #dc2626`

This supports a “university portal” aesthetic, reinforced by:

- a sticky blue top header (`.app-header`) in `App.css`
- card-based layout for posts, forms, and lists
- clear CTA hierarchy: primary buttons in blue/white variants, secondary buttons, and danger buttons

### 12.2 Interaction design patterns (actual components)

- **Cards + modals**:
  - Create post modal (Feed/Profile)
  - Post details modal with comments
  - Follow list modal
  - Confirm dialog overlay for destructive actions
- **Responsive header** (`AppHeader.jsx`):
  - Desktop: search embedded + action buttons (notifications, profile, logout).
  - Mobile: search toggle icon + hamburger menu that opens a drawer; body scroll lock.
- **Academic categorization**:
  - Category badge and category icon for each post (`FeedPostCard`, `PostDetailsModal`, `ProfilePostCard`).
- **Role differentiation**:
  - Role badge visible across discovery and content contexts.

### 12.3 Feed usability

`Feed.jsx` implements:

- welcome message for academic context
- category filter pills
- empty states for no posts and no posts for selected category
- direct navigation from notifications to feed with optional auto-open of a post modal (`openPostId`).

## 13. File Upload System

### 13.1 Backend storage and serving

The backend uses local filesystem storage:

- The `uploads/` directory is created automatically on server startup if missing.
- Static file serving is enabled under `/uploads`.

Multer usage differs slightly across routes:

- **Profile** (`routes/profile.js`):
  - disk storage with filename `Date.now() + safeOriginalName`
  - no explicit `fileFilter` or size limits at Multer level
- **Posts** (`routes/posts.js`):
  - explicit image-only filter for JPEG/PNG/WebP
  - 5MB limit
  - returns user-friendly errors for file size and invalid file type

### 13.2 Frontend validation and preview

- `CreatePostForm.jsx` enforces:
  - image type checks (MIME + extension)
  - max file size 5MB
  - preview rendering before submission
- `ProfileAvatar.jsx` supports:
  - image-only selection check (`file.type.startsWith("image/")`)
  - preview modal before uploading

### 13.3 Cleanup logic (implemented best-effort)

The backend includes best-effort deletion of local files in several flows:

- replacing/removing profile image (`PUT /api/profile/me`)
- deleting a post (`DELETE /api/posts/:id`)
- deleting an account (`DELETE /api/users/me`), including:
  - profile image deletion
  - deletion of all posts by the user and associated image deletions

## 14. Security & Validation (thesis-level implementation)

### 14.1 Implemented protections

- **JWT-protected endpoints** via `requireAuth`.
- **Ownership checks**:
  - only post author can edit/delete a post
  - comment delete allowed for comment owner or post owner
  - notification read allowed only for recipient
  - follow cannot target self
- **Password hashing** with bcrypt.
- **CORS allowlist**:
  - allows localhost ports for Vite development
  - supports an explicit `CORS_ORIGIN` in environment config

### 14.2 Validation behaviors

- Registration validates required fields and role constraints.
- Post creation validates category values and non-empty content-or-image constraint.
- Post uploads enforce image constraints server-side.
- Profile completeness computed server-side to avoid purely UI-driven correctness.

### 14.3 Security limitations (appropriate to prototype scope)

- Profile image upload in `routes/profile.js` lacks explicit MIME validation and file size limit (unlike posts).
- Password reset flow returns the reset token in the response (explicitly documented as demo behavior).
- No rate-limiting for login/search endpoints.
- No pagination and no server-side filtering in feed (risk of performance issues at scale).

## 15. Current Limitations (observed directly from implementation)

- **Local image storage**: `uploads/` is stored on server disk; not suitable for multi-instance deployment or durable storage.
- **Polling-based notifications**: dropdown polls every 45 seconds; no WebSockets/SSE.
- **No pagination**: `GET /api/posts` returns all posts; search is limited but feed is unbounded.
- **Password reset is a demo**: reset token is returned in API response, not emailed.
- **Profile gating bypass**: `skipProfileSetup=1` allows feed access even if profile is incomplete (intentional demo flexibility).
- **Inconsistent upload validation**:
  - posts strictly filter image MIME and size
  - profile upload does not enforce MIME and size server-side
- **Notification cleanup relies on matching `commentText`** for comment delete, which is not robust if identical comments exist.
- **No dedicated service/controller layer**: route files contain mixed concerns (validation, persistence, cleanup, formatting).

## 16. Technical Challenges (evidence-based discussion points)

### 16.1 State synchronization without global state

The frontend avoids a centralized store and instead uses local state + targeted refresh mechanisms:

- feed state updated by replacing a single post after like/comment/edit (`handlePostUpdated`)
- global `notifications:refresh` event bridges components without a global state library

### 16.2 Notifications as cross-cutting side effects

Notifications are generated in multiple backend routes. Ensuring correctness required:

- avoiding self-notifications
- removing notifications when actions are reversed (unlike, unfollow, comment delete)
- deduplicating likes by checking for an existing notification

### 16.3 Upload lifecycle and cleanup

- File deletion is best-effort to prevent request failure.
- Multiple deletion points exist (post delete, account delete, profile update), increasing the need for careful path validation (only delete local `/uploads/...`).

### 16.4 Profile completeness as a cross-layer constraint

Profile completeness is enforced:

- in backend computation (source of truth)
- in frontend routing guard (navigation gating)
- with a user-friendly bypass for thesis demo purposes

### 16.5 Follow/connect relationship semantics

The system distinguishes:

- following (one-way)
- follower (reverse relationship)
- friend/connection (mutual following)

and renders those semantics through UI labels (“Connect Back”, “Connected”).

## 17. Future Improvements

- **Cloud storage** for uploads (S3-compatible) + durable URLs in MongoDB.
- **Real-time notifications** via WebSockets or SSE.
- **Messaging/chat** for academic collaboration.
- **Pagination** for feed, profile posts, notifications.
- **Improved validation**: unify upload validation across profile and posts; introduce schema validation (Zod/Joi).
- **Recommendation features**: skill-based user suggestions; category-based feed ranking; AI-assisted matching/summarization (optional extension).

## 18. Testing Suggestions

### 18.1 Auth testing

- Register: required fields, uniqueness, role validation.
- Login: identifier as email and username; wrong password; missing fields.
- Password reset demo: token expiry, invalid token, password update.

### 18.2 CRUD testing

- Profile update JSON vs multipart; image replace/remove; completeness recomputation.
- Posts create/edit/delete; author-only constraints; image constraints.
- Comments add/delete; permissions (comment owner vs post owner).

### 18.3 Upload tests

- Allowed file types and max size for posts.
- Profile image upload and replacement; verify old local file deletion best-effort.

### 18.4 Notifications tests

- Like/comment/follow/post notifications created correctly and not for self-actions.
- Cleanup on unlike/unfollow/comment delete/post delete.
- Mark read and mark all read.

### 18.5 Follow/connect tests

- Follow/unfollow; connect-back; friend state; connections/mutual endpoints correctness.

## 19. Conclusion

TSI CONNECT implements a complete academic social networking workflow: from identity creation and academic profile modeling to categorized content sharing and social interactions reinforced by notifications. The project’s academic value lies in demonstrating full-stack design decisions (data modeling, REST API design, route guarding, upload lifecycle management) under realistic prototype constraints (local storage and polling). The resulting platform is suitable for thesis defense presentation and provides a robust baseline for future production-level extensions.

## Appendix A — Implemented REST API Summary

### A.1 `/api/auth`

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### A.2 `/api/profile`

- `GET /api/profile/me`
- `GET /api/profile/:userId`
- `PUT /api/profile/me`

### A.3 `/api/users`

- `GET /api/users/me`
- `DELETE /api/users/me`
- `GET /api/users/search`
- `GET /api/users/:id/followers`
- `GET /api/users/:id/following`
- `GET /api/users/:id/mutual`
- `GET /api/users/:id/connections`
- `PUT /api/users/:id/follow`

### A.4 `/api/posts`

- `POST /api/posts`
- `GET /api/posts`
- `GET /api/posts/user/:userId`
- `PUT /api/posts/:id`
- `DELETE /api/posts/:id`
- `PUT /api/posts/:id/like`
- `POST /api/posts/:id/comments`
- `DELETE /api/posts/:postId/comments/:commentId`

### A.5 `/api/notifications`

- `GET /api/notifications`
- `PUT /api/notifications/:id/read`
- `PUT /api/notifications/read-all`

## Appendix B — Suggested Thesis Chapter Structure

1. Introduction  
2. Literature Review / System Analysis  
3. Requirements Specification  
4. System Design  
5. Implementation  
6. Testing and Validation  
7. Results and Discussion  
8. Conclusion  
9. Future Work  

## Appendix C — Suggested Diagrams

- Architecture diagram (React ↔ Express ↔ MongoDB + `uploads/` static serving)
- Use case diagram (auth, profile setup, feed interactions, follow/connect, notifications)
- ER diagram (User/Post/Notification + followers/following self-relation)
- Authentication flow diagram (JWT issuance + client storage + protected endpoints)
- Profile completion gating diagram (guard + skip flag)
- Notifications flow diagram (events → creation → polling → read/navigation)
- Posts interaction workflow (create → like/comment → modals → cleanup)

## Appendix D — Suggested Screenshots

- Register page (role picker)
- Login page (identifier as email/username)
- Profile setup page (complete later + photo upload)
- Feed page (category filters + create post modal)
- Post details modal (comments + delete comment permission)
- Profile page (edit mode + role badge + avatar menu)
- Member profile page (Connect / Connected button states)
- Notifications dropdown (unread badge + mark all read)
