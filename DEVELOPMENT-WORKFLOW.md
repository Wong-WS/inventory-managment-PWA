# Development Workflow Guide

This document explains how to develop and test changes safely without affecting production.

## 🎯 Overview

We have TWO separate Firebase projects:
- **DEV** (`chong-dev-aa98a`) - For testing locally
- **PROD** (`chong-918f9`) - Your client's live site

The code **automatically detects** which database to use based on the URL.

---

## 🔧 Development Workflow

### Step 1: Start Local Development

```bash
# Start local server (choose one)
python3 -m http.server 8000
# OR
firebase serve
```

Open browser: **http://localhost:8000**

**✅ Automatically connects to DEV database**

### Step 2: Make Changes & Test

1. Edit any code files (JS, HTML, CSS)
2. Refresh browser to see changes
3. Test features thoroughly
4. Add test data (products, users, orders)
5. All data goes to **DEV database only**

**Your client's production data is completely safe!**

### Step 3: Deploy to Production

When everything works and you're ready to go live:

```bash
# 1. Commit changes
git add .
git commit -m "Description of changes"

# 2. Push to GitHub
git push

# 3. Deploy to production
firebase deploy
```

**✅ Client's site updates with your changes**

---

## 🔍 How to Know Which Database You're Using

Check the browser **Developer Console** (F12):

### On Localhost (Development)
```
🔥 Firebase Configuration: {
  environment: "development",
  project: "chong-dev-aa98a",  ← DEV DATABASE
  isLocal: true
}
```

### On Deployed Site (Production)
```
🔥 Firebase Configuration: {
  environment: "production",
  project: "chong-918f9",  ← PRODUCTION DATABASE
  isLocal: false
}
```

---

## 📋 Quick Reference

| Action | Database Used | Safe to Break? |
|--------|---------------|----------------|
| `localhost:8000` | DEV (`chong-dev-aa98a`) | ✅ Yes |
| `chong-918f9.web.app` | PROD (`chong-918f9`) | ❌ No - Client's data |

---

## 💡 Best Practices

### ✅ DO:
- Always test locally before deploying
- Use DEV database to test new features
- Reset DEV database anytime (Users tab → Reset Database button)
- Create test data with obvious names like "TEST Product"

### ❌ DON'T:
- Deploy without testing locally first
- Test directly on production URL
- Assume changes are safe without testing

---

## 🔄 Common Scenarios

### Adding a New Feature
```bash
1. Start local server
2. Code the feature
3. Test on localhost (uses DEV database)
4. Fix any bugs
5. Test again
6. When it works: commit → push → deploy
```

### Fixing a Bug
```bash
1. Reproduce bug locally
2. Fix the code
3. Test fix on localhost
4. Confirm it's fixed
5. Deploy to production
```

### Resetting DEV Database
```bash
1. Open localhost:8000
2. Login as admin
3. Go to Users tab
4. Scroll to bottom → Click "Reset Database"
5. Fresh start with empty DEV database
```

---

## 🚨 Emergency: Rollback Production

If you deployed something broken:

```bash
# 1. Find last working commit
git log --oneline

# 2. Revert to that commit
git revert <commit-hash>

# 3. Deploy the revert
firebase deploy
```

Or restore from Firebase Console backup.

---

## 🛠️ Troubleshooting

### "Permission denied" errors on localhost
- Check Firestore Rules in DEV project
- Should be: `allow read, write: if true;`

### Changes not showing on production
- Did you run `firebase deploy`?
- Clear browser cache or use incognito mode

### Not sure which database I'm on
- Check console: Look for "🔥 Firebase Configuration"
- Dev = localhost URLs only
- Prod = everything else

---

## 📞 Need Help?

1. Check console for error messages
2. Verify you're on the correct database (check console log)
3. Ensure local server is running
4. Try clearing browser cache

---

## 🎓 Summary

**One codebase, two databases, automatic switching.**

- **Code once** → Works everywhere
- **Test locally** → Uses DEV database
- **Deploy** → Updates production

**Your client's data stays safe while you develop!**
