/**
 * Business Day Management Module
 * Handles business day UI components, PIN modal, and real-time updates
 */

import { DB } from './database.js';

const BusinessDayModule = {
  // Current active business day (cached)
  activeBusinessDay: null,

  // Active listener unsubscribe function
  listenerUnsubscribe: null,

  /**
   * Initialize the business day module
   */
  async init() {
    // Load initial active business day
    this.activeBusinessDay = await DB.getActiveBusinessDay();

    // Set up real-time listener for active business day
    this.setupActiveBusinessDayListener();
  },

  /**
   * Setup real-time listener for active business day changes
   */
  setupActiveBusinessDayListener() {
    // Cleanup existing listener if any
    if (this.listenerUnsubscribe) {
      this.listenerUnsubscribe();
    }

    // Listen to active business day changes
    this.listenerUnsubscribe = DB.listenToActiveBusinessDay((businessDay) => {
      this.activeBusinessDay = businessDay;
      this.updateAllBanners();
    });
  },

  /**
   * Render day status banner in a container
   * @param {HTMLElement} containerElement - Container to render banner
   */
  async renderDayStatusBanner(containerElement) {
    if (!containerElement) return;

    // Ensure we have the latest business day data
    if (!this.activeBusinessDay) {
      this.activeBusinessDay = await DB.getActiveBusinessDay();
    }

    // Create banner HTML
    const bannerHTML = this.createBannerHTML();
    containerElement.innerHTML = bannerHTML;

    // Bind button events
    this.bindBannerEvents(containerElement);
  },

  /**
   * Create banner HTML based on current business day status
   * @returns {string} Banner HTML
   */
  createBannerHTML() {
    const session = DB.getCurrentSession();
    if (!session) return '';

    // Check if user can open/close day (admin or sales rep)
    const canManageDay = session.role === DB.ROLES.ADMIN || session.role === DB.ROLES.SALES_REP;

    if (this.activeBusinessDay) {
      // Day is OPEN
      const openedDate = this.activeBusinessDay.openedAt?.toDate ?
        this.activeBusinessDay.openedAt.toDate() : new Date(this.activeBusinessDay.openedAt);

      return `
        <div class="day-status-banner day-open">
          <div class="day-status-info">
            <h3><i class="fas fa-check-circle"></i> ${this.activeBusinessDay.displayLabel} - OPEN</h3>
            <p>Opened ${openedDate.toLocaleString()} by ${this.activeBusinessDay.openedByName}</p>
          </div>
          ${canManageDay ? `
          <div class="day-status-actions">
            <button class="secondary-button close-day-btn">
              <i class="fas fa-lock"></i> Close Day
            </button>
          </div>
          ` : ''}
        </div>
      `;
    } else {
      // Day is CLOSED or no day exists
      return `
        <div class="day-status-banner day-closed">
          <div class="day-status-info">
            <h3><i class="fas fa-times-circle"></i> Day Closed</h3>
            <p>No active business day. ${canManageDay ? 'Open a new day to start accepting orders.' : 'Contact admin to open a day.'}</p>
          </div>
          ${canManageDay ? `
          <div class="day-status-actions">
            <button class="primary-button open-day-btn">
              <i class="fas fa-unlock"></i> Open Day
            </button>
          </div>
          ` : ''}
        </div>
      `;
    }
  },

  /**
   * Bind events to banner buttons
   * @param {HTMLElement} containerElement - Container element
   */
  bindBannerEvents(containerElement) {
    const openBtn = containerElement.querySelector('.open-day-btn');
    const closeBtn = containerElement.querySelector('.close-day-btn');

    if (openBtn) {
      openBtn.addEventListener('click', () => this.showPinModal('open'));
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.showPinModal('close'));
    }
  },

  /**
   * Update all rendered banners (when business day changes)
   */
  updateAllBanners() {
    console.log('Updating all banners. Active business day:', this.activeBusinessDay);

    // Update all banner containers
    const dashboardContainer = document.getElementById('dashboard-day-status-container');
    const ordersContainer = document.getElementById('orders-day-status-container');

    if (dashboardContainer) {
      // Re-render immediately with current cached data
      const bannerHTML = this.createBannerHTML();
      dashboardContainer.innerHTML = bannerHTML;
      this.bindBannerEvents(dashboardContainer);
    }

    if (ordersContainer) {
      // Re-render immediately with current cached data
      const bannerHTML = this.createBannerHTML();
      ordersContainer.innerHTML = bannerHTML;
      this.bindBannerEvents(ordersContainer);
    }
  },

  /**
   * Show PIN entry modal
   * @param {string} action - 'open' or 'close'
   */
  async showPinModal(action) {
    // Check if PIN is configured
    const isPinConfigured = await DB.isBusinessDayPinConfigured();

    if (!isPinConfigured) {
      alert('Business day PIN has not been configured. Please contact administrator to set up PIN in Users tab.');
      return;
    }

    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay pin-modal-overlay';
    modalOverlay.innerHTML = `
      <div class="modal-content pin-modal">
        <div class="modal-header">
          <h3>Enter PIN to ${action === 'open' ? 'Open' : 'Close'} Day</h3>
          <button type="button" class="modal-close">&times;</button>
        </div>
        <div class="pin-input-container">
          <input type="password" maxlength="1" class="pin-digit" data-index="0" autocomplete="off" inputmode="numeric" pattern="[0-9]" />
          <input type="password" maxlength="1" class="pin-digit" data-index="1" autocomplete="off" inputmode="numeric" pattern="[0-9]" />
          <input type="password" maxlength="1" class="pin-digit" data-index="2" autocomplete="off" inputmode="numeric" pattern="[0-9]" />
          <input type="password" maxlength="1" class="pin-digit" data-index="3" autocomplete="off" inputmode="numeric" pattern="[0-9]" />
        </div>
        <div id="pin-error" class="error-message" style="display: none;"></div>
        <div class="modal-actions">
          <button class="primary-button" id="submit-pin-btn">Submit</button>
          <button class="secondary-button" id="cancel-pin-btn">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Get PIN input elements
    const pinInputs = modalOverlay.querySelectorAll('.pin-digit');
    const submitBtn = modalOverlay.querySelector('#submit-pin-btn');
    const cancelBtn = modalOverlay.querySelector('#cancel-pin-btn');
    const closeBtn = modalOverlay.querySelector('.modal-close');
    const errorDiv = modalOverlay.querySelector('#pin-error');

    // Auto-focus first input
    pinInputs[0].focus();

    // Handle PIN input (auto-advance to next digit)
    pinInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        // Only allow digits
        e.target.value = e.target.value.replace(/[^0-9]/g, '');

        // Auto-advance to next input
        if (e.target.value && index < pinInputs.length - 1) {
          pinInputs[index + 1].focus();
        }
      });

      // Handle backspace to go to previous input
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          pinInputs[index - 1].focus();
        }
      });
    });

    // Handle submit
    const handleSubmit = async () => {
      const pin = Array.from(pinInputs).map(input => input.value).join('');

      if (pin.length !== 4) {
        this.showPinError(errorDiv, 'Please enter all 4 digits');
        return;
      }

      // Disable submit button
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';

      try {
        const session = DB.getCurrentSession();
        const user = await DB.getCurrentUser();

        if (action === 'open') {
          await DB.openBusinessDay(session.userId, user.name, pin);
          alert('Business day opened successfully!');
        } else {
          await DB.closeBusinessDay(session.userId, user.name, pin);
          alert('Business day closed successfully!');
        }

        // Close modal
        document.body.removeChild(modalOverlay);
      } catch (error) {
        console.error('Error processing business day:', error);
        this.showPinError(errorDiv, error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    };

    submitBtn.addEventListener('click', handleSubmit);

    // Handle Enter key in PIN inputs
    pinInputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleSubmit();
        }
      });
    });

    // Handle cancel/close
    const closeModal = () => {
      document.body.removeChild(modalOverlay);
    };

    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });
  },

  /**
   * Show error message in PIN modal
   * @param {HTMLElement} errorDiv - Error div element
   * @param {string} message - Error message
   */
  showPinError(errorDiv, message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    // Hide after 5 seconds
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 5000);
  },

  /**
   * Cleanup listeners on module unload
   */
  cleanup() {
    if (this.listenerUnsubscribe) {
      this.listenerUnsubscribe();
      this.listenerUnsubscribe = null;
    }
  }
};

// Export the module
export { BusinessDayModule };

// Make module globally accessible for backward compatibility
window.BusinessDayModule = BusinessDayModule;

// Initialize the module when script loads
BusinessDayModule.init();
