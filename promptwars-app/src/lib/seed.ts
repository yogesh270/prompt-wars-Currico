import type {
  RoleId, Skill, Role, Course, QuizQuestion, Learner
} from "./types";

// ─── Skills (25 total) ────────────────────────────────────────────────────────

export const SKILLS: Skill[] = [
  // Core programming
  { id: "python",        name: "Python",             prereqs: [],             aliases: ["py"] },
  { id: "javascript",    name: "JavaScript",          prereqs: [],             aliases: ["js"] },
  { id: "typescript",    name: "TypeScript",          prereqs: ["javascript"], aliases: ["ts"] },
  { id: "html",          name: "HTML & CSS",          prereqs: [],             aliases: ["html-css", "css"] },
  { id: "sql",           name: "SQL",                 prereqs: [],             aliases: ["mysql", "postgres"] },
  // Web / Full Stack
  { id: "react",         name: "React",               prereqs: ["javascript", "html"], aliases: ["reactjs"] },
  { id: "nextjs",        name: "Next.js",             prereqs: ["react", "typescript"], aliases: ["next"] },
  { id: "nodejs",        name: "Node.js",             prereqs: ["javascript"], aliases: ["node"] },
  { id: "rest-api",      name: "REST API Design",     prereqs: ["nodejs"],     aliases: ["rest", "api-design"] },
  { id: "git",           name: "Git & Version Control", prereqs: [],           aliases: ["github", "version-control"] },
  // Data
  { id: "pandas",        name: "Pandas",              prereqs: ["python"],     aliases: [] },
  { id: "numpy",         name: "NumPy",               prereqs: ["python"],     aliases: [] },
  { id: "data-viz",      name: "Data Visualization",  prereqs: ["pandas"],     aliases: ["matplotlib", "seaborn"] },
  { id: "statistics",    name: "Statistics",          prereqs: ["numpy"],      aliases: ["stats"] },
  { id: "excel",         name: "Excel / Sheets",      prereqs: [],             aliases: ["spreadsheets"] },
  // AI / ML
  { id: "ml-basics",     name: "ML Fundamentals",     prereqs: ["numpy", "statistics"], aliases: ["machine-learning"] },
  { id: "prompt-eng",    name: "Prompt Engineering",  prereqs: ["python"],     aliases: ["prompting"] },
  { id: "llm-apis",      name: "LLM APIs",            prereqs: ["python", "rest-api", "prompt-eng"], aliases: ["openai-api", "gemini-api"] },
  { id: "vector-db",     name: "Vector Databases",    prereqs: ["python", "ml-basics"], aliases: ["embeddings", "pgvector"] },
  { id: "fastapi",       name: "FastAPI",              prereqs: ["python", "rest-api"], aliases: [] },
  // Infra / Cloud
  { id: "docker",        name: "Docker",              prereqs: ["nodejs"],     aliases: ["containers"] },
  { id: "cloud-deploy",  name: "Cloud Deployment",    prereqs: ["docker"],     aliases: ["vercel", "gcp", "aws"] },
  // Databases
  { id: "postgres",      name: "PostgreSQL",          prereqs: ["sql"],        aliases: ["psql"] },
  { id: "nosql",         name: "NoSQL / MongoDB",     prereqs: [],             aliases: ["mongodb"] },
  // Soft / Process
  { id: "testing",       name: "Testing & QA",        prereqs: ["javascript"], aliases: ["jest", "pytest"] },
];

const SKILL_IDS = new Set(SKILLS.map(s => s.id));

// ─── Roles (3) ────────────────────────────────────────────────────────────────

export const ROLES: Role[] = [
  {
    id: "full-stack",
    title: "Full Stack Developer",
    requirements: [
      { skillId: "javascript", level: 4, weight: 5, mustHave: true },
      { skillId: "typescript", level: 3, weight: 4, mustHave: true },
      { skillId: "react",      level: 4, weight: 5, mustHave: true },
      { skillId: "nextjs",     level: 3, weight: 4, mustHave: true },
      { skillId: "nodejs",     level: 3, weight: 4, mustHave: true },
      { skillId: "rest-api",   level: 3, weight: 3, mustHave: false },
      { skillId: "sql",        level: 2, weight: 3, mustHave: false },
      { skillId: "postgres",   level: 2, weight: 2, mustHave: false },
      { skillId: "git",        level: 3, weight: 3, mustHave: true },
      { skillId: "testing",    level: 2, weight: 2, mustHave: false },
      { skillId: "html",       level: 3, weight: 3, mustHave: true },
      { skillId: "cloud-deploy", level: 2, weight: 2, mustHave: false },
    ],
  },
  {
    id: "data-analyst",
    title: "Data Analyst",
    requirements: [
      { skillId: "python",     level: 3, weight: 5, mustHave: true },
      { skillId: "sql",        level: 4, weight: 5, mustHave: true },
      { skillId: "pandas",     level: 4, weight: 5, mustHave: true },
      { skillId: "numpy",      level: 3, weight: 3, mustHave: false },
      { skillId: "statistics", level: 3, weight: 4, mustHave: true },
      { skillId: "data-viz",   level: 4, weight: 4, mustHave: true },
      { skillId: "excel",      level: 3, weight: 2, mustHave: false },
      { skillId: "git",        level: 2, weight: 2, mustHave: false },
      { skillId: "postgres",   level: 2, weight: 3, mustHave: false },
    ],
  },
  {
    id: "ai-backend",
    title: "AI Backend Engineer",
    requirements: [
      { skillId: "python",      level: 4, weight: 5, mustHave: true },
      { skillId: "fastapi",     level: 3, weight: 4, mustHave: true },
      { skillId: "llm-apis",    level: 4, weight: 5, mustHave: true },
      { skillId: "prompt-eng",  level: 4, weight: 5, mustHave: true },
      { skillId: "vector-db",   level: 3, weight: 4, mustHave: true },
      { skillId: "ml-basics",   level: 3, weight: 3, mustHave: false },
      { skillId: "rest-api",    level: 3, weight: 3, mustHave: false },
      { skillId: "docker",      level: 2, weight: 3, mustHave: false },
      { skillId: "postgres",    level: 2, weight: 2, mustHave: false },
      { skillId: "git",         level: 3, weight: 3, mustHave: true },
    ],
  },
];

// ─── Courses (24 total, 8 per role) ───────────────────────────────────────────

export const COURSES: Course[] = [
  // ── Full Stack (8) ──
  {
    id: "fs-js-fundamentals",
    title: "JavaScript Fundamentals",
    provider: "MDN / freeCodeCamp",
    url: "https://developer.mozilla.org/en-US/docs/Learn/JavaScript",
    skills: ["javascript"],
    level: 1, hours: 10, format: "course",
  },
  {
    id: "fs-ts-basics",
    title: "TypeScript for Beginners",
    provider: "TypeScript Handbook",
    url: "https://www.typescriptlang.org/docs/handbook/intro.html",
    skills: ["typescript"],
    level: 2, hours: 6, format: "docs",
  },
  {
    id: "fs-react-core",
    title: "React — The Complete Course",
    provider: "Scrimba",
    url: "https://scrimba.com/learn/learnreact",
    skills: ["react", "html"],
    level: 2, hours: 12, format: "course",
  },
  {
    id: "fs-nextjs-intro",
    title: "Next.js App Router — Full Course",
    provider: "Vercel / Next.js Docs",
    url: "https://nextjs.org/learn",
    skills: ["nextjs", "typescript"],
    level: 3, hours: 8, format: "course",
  },
  {
    id: "fs-node-api",
    title: "Node.js & REST API Design",
    provider: "The Odin Project",
    url: "https://www.theodinproject.com/paths/full-stack-javascript",
    skills: ["nodejs", "rest-api"],
    level: 2, hours: 8, format: "course",
  },
  {
    id: "fs-postgres",
    title: "PostgreSQL — Practical Introduction",
    provider: "Neon Tutorial",
    url: "https://neon.tech/postgresql/postgresql-tutorial",
    skills: ["sql", "postgres"],
    level: 2, hours: 5, format: "docs",
  },
  {
    id: "fs-testing",
    title: "Testing JavaScript with Jest",
    provider: "Kent C. Dodds",
    url: "https://testingjavascript.com/",
    skills: ["testing"],
    level: 2, hours: 5, format: "course",
  },
  {
    id: "fs-deploy",
    title: "Deploy Full Stack Apps on Vercel",
    provider: "Vercel Docs",
    url: "https://vercel.com/docs",
    skills: ["cloud-deploy", "git"],
    level: 2, hours: 3, format: "docs",
  },

  // ── Data Analyst (8) ──
  {
    id: "da-python-data",
    title: "Python for Data Analysis",
    provider: "Kaggle",
    url: "https://www.kaggle.com/learn/python",
    skills: ["python", "pandas"],
    level: 1, hours: 8, format: "course",
  },
  {
    id: "da-sql-advanced",
    title: "Advanced SQL for Data Analysts",
    provider: "Mode Analytics",
    url: "https://mode.com/sql-tutorial/",
    skills: ["sql", "postgres"],
    level: 2, hours: 6, format: "course",
  },
  {
    id: "da-pandas-deep",
    title: "Pandas Deep Dive",
    provider: "Kaggle",
    url: "https://www.kaggle.com/learn/pandas",
    skills: ["pandas", "numpy"],
    level: 2, hours: 5, format: "course",
  },
  {
    id: "da-statistics",
    title: "Statistics for Data Science",
    provider: "Khan Academy / StatQuest",
    url: "https://www.khanacademy.org/math/statistics-probability",
    skills: ["statistics", "numpy"],
    level: 2, hours: 10, format: "course",
  },
  {
    id: "da-visualization",
    title: "Data Visualization with Python",
    provider: "Kaggle",
    url: "https://www.kaggle.com/learn/data-visualization",
    skills: ["data-viz", "pandas"],
    level: 2, hours: 5, format: "course",
  },
  {
    id: "da-excel",
    title: "Excel / Google Sheets for Analysts",
    provider: "Coursera (Google)",
    url: "https://www.coursera.org/learn/excel-google-sheets-pivot-tables",
    skills: ["excel"],
    level: 1, hours: 4, format: "course",
  },
  {
    id: "da-git",
    title: "Git for Data Professionals",
    provider: "DataCamp",
    url: "https://www.datacamp.com/courses/introduction-to-git",
    skills: ["git"],
    level: 1, hours: 3, format: "course",
  },
  {
    id: "da-capstone",
    title: "End-to-End Data Analysis Project",
    provider: "Project (self-directed)",
    url: "https://www.kaggle.com/competitions",
    skills: ["data-viz", "statistics", "pandas"],
    level: 3, hours: 8, format: "project",
  },

  // ── AI Backend (8) ──
  {
    id: "ai-python-adv",
    title: "Python — Intermediate to Advanced",
    provider: "Real Python",
    url: "https://realpython.com/",
    skills: ["python"],
    level: 3, hours: 8, format: "course",
  },
  {
    id: "ai-prompt-eng",
    title: "Prompt Engineering for Developers",
    provider: "DeepLearning.AI",
    url: "https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers/",
    skills: ["prompt-eng"],
    level: 2, hours: 4, format: "course",
  },
  {
    id: "ai-llm-apis",
    title: "Building with LLM APIs",
    provider: "DeepLearning.AI",
    url: "https://www.deeplearning.ai/short-courses/building-systems-with-chatgpt/",
    skills: ["llm-apis", "rest-api"],
    level: 3, hours: 5, format: "course",
  },
  {
    id: "ai-fastapi",
    title: "FastAPI — Build Production APIs",
    provider: "Full Stack FastAPI",
    url: "https://fastapi.tiangolo.com/tutorial/",
    skills: ["fastapi", "rest-api"],
    level: 2, hours: 6, format: "docs",
  },
  {
    id: "ai-vector-db",
    title: "Vector Databases & Embeddings",
    provider: "Weaviate Academy",
    url: "https://weaviate.io/developers/academy",
    skills: ["vector-db"],
    level: 3, hours: 5, format: "course",
  },
  {
    id: "ai-ml-basics",
    title: "Machine Learning Fundamentals",
    provider: "fast.ai",
    url: "https://course.fast.ai/",
    skills: ["ml-basics", "statistics"],
    level: 2, hours: 10, format: "course",
  },
  {
    id: "ai-docker",
    title: "Docker for Backend Developers",
    provider: "Docker Docs / TechWorld",
    url: "https://docs.docker.com/get-started/",
    skills: ["docker", "cloud-deploy"],
    level: 2, hours: 5, format: "docs",
  },
  {
    id: "ai-git-ci",
    title: "Git & CI/CD for AI Projects",
    provider: "GitHub Docs",
    url: "https://docs.github.com/en/actions",
    skills: ["git"],
    level: 2, hours: 3, format: "docs",
  },
];

// Guard: verify all skill references exist in SKILLS
(function validateSeed() {
  if (typeof window !== "undefined") return; // client-only guard
  for (const course of COURSES) {
    for (const sid of course.skills) {
      if (!SKILL_IDS.has(sid)) throw new Error(`Course ${course.id} references unknown skill "${sid}"`);
    }
  }
  for (const role of ROLES) {
    for (const req of role.requirements) {
      if (!SKILL_IDS.has(req.skillId)) throw new Error(`Role ${role.id} references unknown skill "${req.skillId}"`);
    }
  }
})();

// ─── Quiz Questions (15: 5 per role) ──────────────────────────────────────────

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // Full Stack (5)
  {
    questionId: "fs-q1", roleId: "full-stack", skillId: "javascript",
    question: "Which JavaScript feature allows an inner function to access variables from its outer enclosing scope?",
    options: ["Closure", "Hoisting", "Prototype Chaining", "Currying"],
    answerKey: "Closure",
  },
  {
    questionId: "fs-q2", roleId: "full-stack", skillId: "react",
    question: "What hook is used to manage local component state in React?",
    options: ["useEffect", "useRef", "useState", "useContext"],
    answerKey: "useState",
  },
  {
    questionId: "fs-q3", roleId: "full-stack", skillId: "typescript",
    question: "Which TypeScript utility type constructs a type with all properties of Type set to optional?",
    options: ["Partial<T>", "Required<T>", "Readonly<T>", "Record<K, T>"],
    answerKey: "Partial<T>",
  },
  {
    questionId: "fs-q4", roleId: "full-stack", skillId: "rest-api",
    question: "Which HTTP method is idempotent and used to fully replace an existing resource?",
    options: ["POST", "PATCH", "PUT", "DELETE"],
    answerKey: "PUT",
  },
  {
    questionId: "fs-q5", roleId: "full-stack", skillId: "postgres",
    question: "In PostgreSQL, which constraint enforces referential integrity between two related tables?",
    options: ["PRIMARY KEY", "FOREIGN KEY", "UNIQUE", "CHECK"],
    answerKey: "FOREIGN KEY",
  },

  // Data Analyst (5)
  {
    questionId: "da-q1", roleId: "data-analyst", skillId: "sql",
    question: "Which SQL clause filters groups after aggregation?",
    options: ["WHERE", "GROUP BY", "HAVING", "ORDER BY"],
    answerKey: "HAVING",
  },
  {
    questionId: "da-q2", roleId: "data-analyst", skillId: "pandas",
    question: "Which Pandas method removes rows with missing values?",
    options: ["fillna()", "dropna()", "isna()", "replace()"],
    answerKey: "dropna()",
  },
  {
    questionId: "da-q3", roleId: "data-analyst", skillId: "statistics",
    question: "What does a p-value less than 0.05 indicate in hypothesis testing?",
    options: [
      "The null hypothesis is true",
      "The result is statistically significant",
      "The sample size is too small",
      "The effect size is large",
    ],
    answerKey: "The result is statistically significant",
  },
  {
    questionId: "da-q4", roleId: "data-analyst", skillId: "python",
    question: "Which Python built-in function returns both index and value when iterating over a sequence?",
    options: ["enumerate()", "zip()", "range()", "map()"],
    answerKey: "enumerate()",
  },
  {
    questionId: "da-q5", roleId: "data-analyst", skillId: "data-viz",
    question: "Which chart type is best suited for analyzing the relationship between two continuous variables?",
    options: ["Bar chart", "Pie chart", "Scatter plot", "Histogram"],
    answerKey: "Scatter plot",
  },

  // AI Backend (5)
  {
    questionId: "ai-q1", roleId: "ai-backend", skillId: "prompt-eng",
    question: "Which prompting technique asks the model to reason step-by-step before answering?",
    options: ["Few-shot prompting", "Chain-of-thought prompting", "Zero-shot prompting", "Role prompting"],
    answerKey: "Chain-of-thought prompting",
  },
  {
    questionId: "ai-q2", roleId: "ai-backend", skillId: "vector-db",
    question: "What metric is typically used to find the most similar vectors in a vector database?",
    options: ["Euclidean distance", "Cosine similarity", "Manhattan distance", "Hamming distance"],
    answerKey: "Cosine similarity",
  },
  {
    questionId: "ai-q3", roleId: "ai-backend", skillId: "llm-apis",
    question: "What parameter controls the randomness of LLM outputs (0 = deterministic)?",
    options: ["max_tokens", "top_p", "temperature", "frequency_penalty"],
    answerKey: "temperature",
  },
  {
    questionId: "ai-q4", roleId: "ai-backend", skillId: "fastapi",
    question: "Which Python keyword is used to define asynchronous route handlers in FastAPI?",
    options: ["async def", "def sync", "yield def", "await def"],
    answerKey: "async def",
  },
  {
    questionId: "ai-q5", roleId: "ai-backend", skillId: "ml-basics",
    question: "What is the primary risk of training a model for too many epochs on noisy data without regularization?",
    options: ["Overfitting", "Underfitting", "Data drift", "Gradient explosion"],
    answerKey: "Overfitting",
  },
];

// ─── Priya Persona ────────────────────────────────────────────────────────────

export const PRIYA_PERSONA: Learner = {
  id: "priya",
  name: "Priya",
  targetRoleId: "full-stack",
  hoursPerWeek: 5,
  completedModuleIds: [],
  skills: [
    { skillId: "python",     level: 3, confidence: 0.8, evidence: ["university course"] },
    { skillId: "sql",        level: 2, confidence: 0.6, evidence: ["basic queries at internship"] },
    { skillId: "html",       level: 3, confidence: 0.7, evidence: ["personal website + CSS layouts"] },
    { skillId: "git",        level: 2, confidence: 0.5, evidence: ["daily git add/commit/push"] },
    { skillId: "javascript", level: 2, confidence: 0.4, evidence: ["DOM scripts, event handlers"] },
  ],
};
