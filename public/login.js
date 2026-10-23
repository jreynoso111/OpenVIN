(function () {
  var form = document.getElementById('login-form');
  var error = document.getElementById('login-error');
  var submit = document.getElementById('login-submit');
  var next = new URLSearchParams(window.location.search).get('next') || '/';

  function show(message) {
    error.textContent = message;
    error.hidden = !message;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    show('');
    var email = form.elements.email.value.trim();
    var password = form.elements.password.value;
    if (!email || !password) {
      show('Enter your email and password.');
      return;
    }
    submit.disabled = true;
    fetch('/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, next: next }),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data.ok) {
          window.location.replace(result.data.next || '/');
          return;
        }
        show((result.data && result.data.error) || 'Sign-in failed.');
        form.elements.password.value = '';
        submit.disabled = false;
      })
      .catch(function () {
        show('Could not reach the server. Try again.');
        submit.disabled = false;
      });
  });
})();
