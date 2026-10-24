# Example reviewer guidelines (copy to .github/ai-review.md)

- This is a TypeScript monorepo; money is always integer cents.
- Flag any SQL built with string concatenation.
- API handlers must validate input with zod before using it.
- Ignore files under `generated/`.
