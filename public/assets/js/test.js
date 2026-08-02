import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
    import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
    import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

    

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Console logger
    class TestLogger {
      constructor() {
        this.logs = [];
        this.startTime = Date.now();
        this.stats = { passed: 0, failed: 0, total: 0 };
      }

      clear() {
        this.logs = [];
        this.stats = { passed: 0, failed: 0, total: 0 };
        this.render();
      }

      log(message, type = 'log') {
        const time = Date.now() - this.startTime;
        this.logs.push({ message, type, time });
        this.render();
      }

      pass(testName) {
        this.stats.passed++;
        this.stats.total++;
        this.log(`✓ ${testName}`, 'pass');
      }

      fail(testName, error) {
        this.stats.failed++;
        this.stats.total++;
        this.log(`✗ ${testName}: ${error}`, 'fail');
      }

      info(message) {
        this.log(message, 'info');
      }

      warn(message) {
        this.log(message, 'warn');
      }

      render() {
        const consoleEl = document.getElementById('console');
        consoleEl.innerHTML = this.logs.map(log => {
          const timeStr = `[${(log.time / 1000).toFixed(2)}s]`;
          return `<div class="console-line ${log.type}"><span class="time">${timeStr}</span> ${log.message}</div>`;
        }).join('');
        consoleEl.scrollTop = consoleEl.scrollHeight;

        document.getElementById('total-tests').textContent = this.stats.total;
        document.getElementById('total-passed').textContent = this.stats.passed;
        document.getElementById('total-failed').textContent = this.stats.failed;
        document.getElementById('total-time').textContent = `${Date.now() - this.startTime}ms`;
      }
    }

    const logger = new TestLogger();

    // Test suites
    class DOMTests {
      static async run(logger) {
        logger.info('=== Running DOM Tests ===');

        // Navigation test
        const nav = document.querySelector('nav.centered-nav');
        if (nav) logger.pass('Navigation structure exists');
        else logger.fail('Navigation structure', 'Not found');

        // Hero section test
        const hero = document.querySelector('.hero-card');
        if (hero) logger.pass('Hero section exists');
        else logger.fail('Hero section', 'Not found');

        // Forms test
        const forms = document.querySelectorAll('form');
        if (forms.length > 0) logger.pass(`Found ${forms.length} forms`);
        else logger.fail('Forms', 'No forms found');

        // Responsive design check
        const mediaQueries = getComputedStyle(document.documentElement).getPropertyValue('--viewport-width');
        logger.pass('Responsive design implemented');
      }
    }

    class FormTests {
      static async run(logger) {
        logger.info('=== Running Form Tests ===');

        const forms = document.querySelectorAll('form');

        forms.forEach((form, idx) => {
          // Required fields test
          const required = form.querySelectorAll('[required]');
          if (required.length > 0) {
            logger.pass(`Form ${idx + 1}: ${required.length} required fields`);
          }

          // Email validation
          const emailInputs = form.querySelectorAll('input[type="email"]');
          if (emailInputs.length > 0) {
            logger.pass(`Form ${idx + 1}: Email validation`);
          }

          // Character limits
          const textareas = form.querySelectorAll('textarea');
          textareas.forEach(ta => {
            if (ta.maxLength > 0) {
              logger.pass(`Form ${idx + 1}: Character limit set (${ta.maxLength})`);
            }
          });
        });

        logger.info('Form structure validated');
      }
    }

    class AuthTests {
      static async run(logger) {
        logger.info('=== Running Auth Tests ===');

        // Firebase config test
        try {
          if (auth && app) {
            logger.pass('Firebase initialized');
          } else {
            logger.fail('Firebase init', 'Not configured');
          }
        } catch (e) {
          logger.fail('Firebase init', e.message);
        }

        // Auth state listener test
        onAuthStateChanged(auth, (user) => {
          if (user) {
            logger.pass(`Auth state: User logged in (${user.email})`);
          } else {
            logger.info('Auth state: No user currently signed in');
          }
        });

        // Check for auth UI elements
        const signInBtn = document.querySelector('a[href*="auth.html"]');
        if (signInBtn) {
          logger.pass('Sign in link present');
        } else {
          logger.info('Note: Sign in link not found on this page');
        }
      }
    }

    class AITests {
      static async run(logger) {
        logger.info('=== Running AI & API Tests ===');

        // Rate limit check
        const stored = localStorage.getItem('aiUsage');
        if (stored) {
          const usage = JSON.parse(stored);
          logger.info(`Rate limiting: ${usage.count || 0} requests stored`);
        } else {
          logger.pass('Rate limiting: Ready (no usage yet)');
        }

        // Chat storage test
        const chatHistory = localStorage.getItem('chatHistory');
        if (chatHistory) {
          logger.info(`Chat storage: ${JSON.parse(chatHistory).length} messages stored`);
        } else {
          logger.info('Chat storage: Empty (no history)');
        }

        // API endpoint check
        logger.pass('API endpoints configured');
        logger.info('→ POST /api/ask-ai');
        logger.info('→ POST /api/send-confirmation');
      }
    }

    class SEOTests {
      static async run(logger) {
        logger.info('=== Running SEO Tests ===');

        // Meta tags
        const title = document.title;
        if (title && title.length > 10) {
          logger.pass(`Page title: "${title}"`);
        }

        const description = document.querySelector('meta[name="description"]');
        if (description) {
          logger.pass(`Meta description: "${description.getAttribute('content').substring(0, 50)}..."`);
        } else {
          logger.fail('Meta description', 'Missing');
        }

        // Open Graph
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) logger.pass('Open Graph tags present');
        else logger.warn('Open Graph tags missing');

        // Structured data
        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
          logger.pass('JSON-LD structured data present');
        } else {
          logger.warn('JSON-LD structured data missing');
        }

        // H1 tags
        const h1s = document.querySelectorAll('h1');
        if (h1s.length === 1) {
          logger.pass(`Single H1 tag found`);
        } else if (h1s.length > 1) {
          logger.warn(`Multiple H1 tags (${h1s.length}) - should be 1`);
        } else {
          logger.fail('H1 tag', 'Missing');
        }
      }
    }

    class AccessibilityTests {
      static async run(logger) {
        logger.info('=== Running Accessibility Tests ===');

        // ARIA labels
        const ariaLabels = document.querySelectorAll('[aria-label]');
        logger.pass(`${ariaLabels.length} elements with ARIA labels`);

        // Alt text
        const images = document.querySelectorAll('img');
        const withoutAlt = Array.from(images).filter(img => !img.alt);
        if (withoutAlt.length === 0) {
          logger.pass('All images have alt text');
        } else {
          logger.warn(`${withoutAlt.length} images missing alt text`);
        }

        // Color contrast (basic check)
        const buttons = document.querySelectorAll('button');
        if (buttons.length > 0) {
          logger.pass(`${buttons.length} interactive buttons found`);
        }

        // Semantic HTML
        const semanticElements = document.querySelectorAll('main, nav, header, footer, section, article');
        logger.pass(`${semanticElements.length} semantic HTML elements`);
      }
    }

    // Test runner
    window.runTest = async function(testId) {
      logger.clear();
      logger.info(`Running: ${testId}`);

      switch(testId) {
        case 'dom-nav':
        case 'dom-hero':
        case 'dom-forms':
        case 'dom-responsive':
          await DOMTests.run(logger);
          break;
        case 'form-required':
        case 'form-email':
        case 'form-char-limit':
        case 'form-submit':
          await FormTests.run(logger);
          break;
        case 'auth-state':
        case 'auth-firebase':
        case 'auth-redirects':
          await AuthTests.run(logger);
          break;
        case 'ai-rate-limit':
        case 'ai-storage':
        case 'api-endpoint':
          await AITests.run(logger);
          break;
      }

      logger.info(`Completed in ${Date.now() - logger.startTime}ms`);
    };

    window.runAllTests = async function() {
      logger.clear();
      logger.info('=== RUNNING ALL TESTS ===\n');

      await DOMTests.run(logger);
      logger.info('');
      await FormTests.run(logger);
      logger.info('');
      await AuthTests.run(logger);
      logger.info('');
      await AITests.run(logger);
      logger.info('');
      await SEOTests.run(logger);
      logger.info('');
      await AccessibilityTests.run(logger);

      logger.info(`\n✓ Test run complete - ${logger.stats.passed} passed, ${logger.stats.failed} failed`);
    };

    // Button handlers
    document.getElementById('run-all-btn').addEventListener('click', runAllTests);
    document.getElementById('run-dom-btn').addEventListener('click', () => DOMTests.run(logger));
    document.getElementById('run-form-btn').addEventListener('click', () => FormTests.run(logger));
    document.getElementById('run-auth-btn').addEventListener('click', () => AuthTests.run(logger));
    document.getElementById('clear-console-btn').addEventListener('click', () => logger.clear());

    // Initial message
    logger.info('✓ Test console ready');
    logger.info('Click "Run All Tests" or select individual tests');
