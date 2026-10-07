P1-8 lint fix

Changed only:
- Removed the unused StepIndicator import from src/routes/AppRoutes.jsx.

After replacing the file, run:
  npm run lint
  npm run build
  Select-String -Path src\* -Pattern '<<<<<<<|>>>>>>>' -Recurse

Expected lint result: no errors.
