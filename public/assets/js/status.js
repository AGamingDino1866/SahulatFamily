import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
      import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

      

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const form = document.querySelector('#status-form');
      const result = document.querySelector('#status-result');
      const show = (html) => { result.innerHTML = html; result.classList.add('show'); };
      const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
      const today = () => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' }).format(new Date());
      const copyText = async (text) => {
        try {
          await navigator.clipboard.writeText(text);
          window.alert('Application ID copied.');
        } catch {
          window.prompt('Copy this application ID:', text);
        }
      };

      result.addEventListener('click', (event) => {
        const printButton = event.target.closest('[data-print-receipt]');
        if (printButton) window.print();
        const copyButton = event.target.closest('[data-copy-id]');
        if (copyButton) copyText(copyButton.dataset.copyId || '');
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const applicationId = String(data.get('applicationId') || '').trim().toUpperCase();
        if (!applicationId) { show('<p class="error">Put in your ID first.</p>'); return; }
        show('<p>Looking for your status...</p>');
        try {
          const snapshot = await getDoc(doc(db, 'application_status', applicationId));
          if (!snapshot.exists()) {
            show(`<h2>ID Not Found</h2><p class="result-message">We could not find application ID <strong>${escapeHtml(applicationId)}</strong> in our system. Check the spelling carefully (IDs start with SF2026 or SC2026).</p><h3>What should you do?</h3><ul style="margin-left:20px;line-height:1.8;"><li>Check your confirmation email for the correct ID</li><li>Try your ID again (it's case-sensitive)</li><li>Contact us for assistance</li></ul>`);
            return;
          }
          const record = snapshot.data();
          const resolvedId = escapeHtml(record.application_id || applicationId);
          const student = escapeHtml(record.student_name || 'Applicant');
          const city = escapeHtml(record.city || 'Not listed');
          const status = escapeHtml(record.status || 'Received');
          const updated = escapeHtml(record.updated_at || 'Not listed');
          const message = escapeHtml(record.message || 'No extra message has been added yet.');
          const printedAt = escapeHtml(today());
          show(`<div class="screen-result"><h2>${status}</h2><div class="result-grid"><div><span>Application ID</span><strong>${resolvedId}</strong></div><div><span>Student</span><strong>${student}</strong></div><div><span>City</span><strong>${city}</strong></div><div><span>Updated</span><strong>${updated}</strong></div></div><p class="result-message">${message}</p><div class="receipt-actions"><button class="button" type="button" data-print-receipt>Print or save</button><button class="button secondary" type="button" data-copy-id="${resolvedId}">Copy ID</button><a class="button secondary" href="contact.html">Contact us</a></div><p class="receipt-note">You can print this page or save it as a PDF.</p></div><section class="print-receipt"><div class="print-head"><strong>Success Factor</strong><span>Application Status Receipt</span></div><div class="print-grid"><div><span>Application ID</span><b>${resolvedId}</b></div><div><span>Status</span><b>${status}</b></div><div><span>Student</span><b>${student}</b></div><div><span>City</span><b>${city}</b></div><div><span>Last Updated</span><b>${updated}</b></div><div><span>Printed</span><b>${printedAt}</b></div></div><div class="print-message"><span>Status Message</span><p>${message}</p></div><p class="print-foot">For help, contact successscholarships2026@gmail.com. Keep this receipt with your application ID.</p></section>`);
        } catch (error) {
          show('<p class="error">We cannot connect right now. Try again, or email us if the ID is right.</p>');
        }
      });
