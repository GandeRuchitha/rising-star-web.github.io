document.addEventListener("DOMContentLoaded", function () {
  const baseUrl = "https://backend4.sharemyworks.com/api/";
  //const baseUrl = 'http://localhost:3000/api/'
  var urlParams = new URLSearchParams(window.location.search);
  var courseId = urlParams.get("courseId");
  var accountId = urlParams.get("accountId");
  var token = urlParams.get("token");
  var price = urlParams.get("price");
  var chinese = window.location.href.includes("cn");
  var organizationId = urlParams.get("organizationId");

  var registerForm = document.getElementById("registerForm");
  var loadingIndicator = document.querySelector(".loading-indicator");
  var isSandiego = organizationId == "66bf6a0dcdae5300148e3a2c" || organizationId == "6713eacd00dcfc85b65c206a";
  var isIrvine = window.location.href.includes('/irvine');

  // Initialize Google auth if isIrvine
  if (isIrvine) {
    initializeGoogleAuth();
    // Use safe renderer which waits for the client library to be available
    window.renderGoogleButtonSafe('google-signin-button', {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      text: 'signup_with',
      shape: 'rectangular',
      logo_alignment: 'left'
    });
  }

  if (courseId) {
    populateCourseInfoCard(courseId, token);
  } else {
    const courseInfoCard = document.querySelector('.card.shadow-lg.mb-5');
    if (courseInfoCard) {
      courseInfoCard.style.display = 'none';
    }
  }


  registerForm.addEventListener("submit", async function (event) {
    console.log("Form submitted");
    event.preventDefault();

    // Validate form first
    if (!registerForm.checkValidity()) {
      registerForm.classList.add('was-validated');
      return; // Stop execution if form is invalid
    }
    loadingIndicator.style.display = "block";


    var formData = new FormData(registerForm);

    var postData = {
      email: formData.get("studentEmail"),
      email2: formData.get("parentEmail"),
      password: formData.get("password"),
      phone2: formData.get("phone"),
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      grade: formData.get("grade"),
      dateOfBirth: formData.get("dateOfBirth") || new Date().toISOString().split('T')[0],
      organizationId: organizationId,
      username: (
        formData.get("firstName") + formData.get("lastName")
      ).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + Math.floor(Math.random() * 900 + 100),
      preferedLanguage: chinese ? "Chinese" : "English",
    };

    if (isSandiego) {
      // For San Diego, create account and course linking immediately
      console.log('San Diego registration - creating account immediately');
      
      try {
        // Create account immediately
        const response = await fetch(`${baseUrl}Account`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postData)
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Account creation failed:', errorData);
          throw new Error(errorData.error?.message || 'Failed to create account');
        }

        const accountData = await response.json();
        const studentId = accountData.id;
        console.log('Account created with ID:', studentId);

        // Handle course linking and payment history
        if (courseId) {
          if (courseId !== '1v1') {
            // Link student to regular course
            console.log('Linking student to course:', courseId);
            const courseResponse = await fetch(
              `${baseUrl}Course/${courseId}/students/rel/${studentId}`, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`
              }
            });
            
            if (!courseResponse.ok) {
              console.error('Failed to attach student to course');
              // Continue anyway - can be fixed manually
            } else {
              console.log('Student successfully linked to course');
            }
          }
          
          // Add payment history record for both regular and 1v1 courses
          try {
            const paymentData = {
              accountId: studentId,
              status: "payment_pending"
            };
            
            if (courseId === '1v1') {
              paymentData.comment = "1v1 - payment pending";
            } else {
              paymentData.courseId = courseId;
              paymentData.comment = "Course registration - payment pending";
            }
            
            const paymentHistoryResponse = await fetch(`${baseUrl}Account/updatePaymentHistory`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(paymentData)
            });
            
            if (paymentHistoryResponse.ok) {
              console.log('Payment history record created');
            } else {
              console.error('Failed to create payment history record');
            }
          } catch (error) {
            console.error('Error creating payment history record:', error);
          }
        }

        // Store account info for payment processing
        localStorage.setItem('registrationAccountId', studentId);
        localStorage.setItem('registrationCourseId', courseId || '');
        localStorage.setItem('registrationToken', token);
        
        loadingIndicator.style.display = "none";

        const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
        confirmModal.show();

        // Remove any existing event listeners and add new one
        const confirmButton = document.getElementById('confirmRedirect');
        if (confirmButton) {
          const newButton = confirmButton.cloneNode(true);
          confirmButton.parentNode.replaceChild(newButton, confirmButton);
          
          newButton.addEventListener('click', function() {
            Toastify({
              text: "Redirecting to pricing page...",
              duration: 1000,
              close: true,
              gravity: "top",
              position: 'right',
              style: {
                background: "green",
              },
              className: "info",
            }).showToast();

            // Hide modal and redirect
            confirmModal.hide();
            setTimeout(() => {
              window.location.href = "/sandiego/pricing";
            }, 500);
          });
        }

      } catch (error) {
        console.error('San Diego registration failed:', error);
        loadingIndicator.style.display = "none";
        
        // Parse error message for duplicate email
        let errorMessage;
        if (error.message && (error.message.includes('is not unique') || error.message.includes('already exists'))) {
          errorMessage = "This email address is already registered. Please use a different email or contact us if you need help accessing your existing account.";
        } else {
          errorMessage = error.message + ". Registration failed, please try again or contact us for assistance.";
        }
        
        // Show error message to user
        Toastify({
          text: errorMessage,
          duration: 6000,
          close: true,
          gravity: "top",
          position: 'right',
          style: {
            background: "red",
          },
          className: "info",
        }).showToast();
        
        // Re-enable form
        document.querySelectorAll('#registerForm input, #registerForm select, #registerForm button').forEach(el => {
          el.disabled = false;
        });
      }

    } else {
      // Original flow for non-San Diego users
      if (accountId) {
        updateAccount(postData, accountId, token);
      } else {
        createAccount(postData);
      }
    }

  });

    // Function to populate the course info card
    function populateCourseInfoCard(courseId, token) {
      // For 1v1 private class, show TBD
      if (courseId === "1v1" && isSandiego) {
        // This fix is due to that because those ids doesn't exist,
        // this causes the populateCourseInfoCard to fail which halt the
        // later on execution of binding the form submit event to the form.
        // It seems that those forms exist inside register.html, but not in
        // location_register.html, thus adding a temporary fix with try catch.
        try {
          document.getElementById("registerCourseName").innerText = "1v1 private class";
          // For San Diego: Hide dates and price elements
          const datesElement = document.getElementById("registerCourseDates");
          const priceContainer = document.getElementById("priceContainer");
          
          // Hide the entire date row (including "Course Date:" label)
          if (datesElement) {
            const dateRow = datesElement.closest('.row');
            if (dateRow) {
              dateRow.style.display = "none";
            }
          }
          if (priceContainer) {
            priceContainer.style.display = "none";
          }
        } catch {
          console.error("Failed to populate course info card");
        }
        return;
      }
  
      const apiUrl = baseUrl + "Course/";
      const url = `${apiUrl}${courseId}?filter=${encodeURIComponent(
        JSON.stringify({ include: ["instructor", "classDays", "coursesDB"] })
      )}`;
  
      fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Network response was not ok");
          }
          return response.json();
        })
        .then((course) => {
          // Update course info card
          document.getElementById("registerCourseName").innerText = course.name;
          
          if (isSandiego) {
            // For San Diego: Hide dates and price, only show course name
            const datesElement = document.getElementById("registerCourseDates");
            const priceContainer = document.getElementById("priceContainer");
            
            // Hide the entire date row (including "Course Date:" label)
            if (datesElement) {
              const dateRow = datesElement.closest('.row');
              if (dateRow) {
                dateRow.style.display = "none";
              }
            }
            if (priceContainer) {
              priceContainer.style.display = "none";
            }
          } else {
            // For other locations: Show dates and price as before
            document.getElementById("registerCourseDates").innerText = 
              course.dateStart.split("T")[0] + " - " + course.dateEnd.split("T")[0];

            const priceContainer = document.getElementById("priceContainer");
            if (course.price && course.price !== 0) {
                document.getElementById("registerCoursePrice").innerText = "$" + course.price;
                priceContainer.classList.remove("d-none");
                priceContainer.classList.add("d-flex");
            } else {
                priceContainer.classList.add("d-none");
                priceContainer.classList.remove("d-flex");
            }
          }
        })
        .catch((error) => {
          console.error("Failed to fetch course details:", error);
          // Hide the course info card if there's an error
          const courseInfoCard = document.querySelector('.card.shadow-lg.mb-5');
          if (courseInfoCard) {
            courseInfoCard.style.display = 'none';
          }
        });
    }

  function updateAccount(data, accountId, token) {
    fetch(`${baseUrl}Account/${accountId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
      .then((response) => response.json())
      .then(() => fetchInvoices(accountId, courseId, price, token, false))
      .catch((error) => {
        console.error("Update failed", error);
        alert("Update failed. Please try again.");
        loadingIndicator.style.display = "none";
      });
  }

  function createAccount(data) {
    const password = data.password;
    data.username = `${data.username}${Math.floor(Math.random() * 900 + 100)}`; // Generates a random number from 100 to 999
    fetch(`${baseUrl}Account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then((response) => response.json())
      .then((data) => {
        attachStudentToCourse(
          data.id,
          courseId,
          token,
          price,
          data.username,
          password
        );
      })
      .catch((error) => {
        console.error("Registration failed", error);
        
        // Parse error message for duplicate email
        let errorMessage = "Register failed. Please check your information and try again. Or contact management for help.";
        if (error.message && (error.message.includes('email` is not unique') || error.message.includes('Email already exists'))) {
          errorMessage = "This email address is already registered. Please use a different email or contact management for help accessing your existing account.";
        }
        
        Toastify({
                text: errorMessage,
                duration: 6000,
                close: true,
                gravity: "top", 
                position: 'right',
                style: {
                    background: "red",
                },
                className: "info",
            }).showToast();
        loadingIndicator.style.display = "none";
      });
  }

  function fetchInvoices(
    accountId,
    courseId,
    price,
    token,
    isNewAccount = false
  ) {
    // Determine the filter based on whether the account is new or existing

    let filter = isNewAccount
      ? JSON.stringify({
          where: {
            courseId: courseId,
          },
        })
      : JSON.stringify({
          order: "date DESC",
          limit: 1,
        });

    fetch(
      `${baseUrl}Account/${accountId}/invoices?access_token=${token}&filter=${encodeURIComponent(
        filter
      )}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
      .then((response) => response.json())
      .then((invoices) => {
        if (invoices.length > 0) {
          const invoice = invoices[0];
          Toastify({
                    text: "Registration Success! Redirecting to checkout page.",
                    duration: 5000,
                    close: true,
                    gravity: "top",
                    position: 'right', 
                    style: {
                        background: "green",
                    },
                    className: "info",
                }).showToast();
          setTimeout(() => {
            window.location.href = `https://www.sharemyworks.com/checkout?invoiceId=${invoice.id}&courseId=${courseId}&studentId=${accountId}&comment=&amount=${invoice.amount}&token=${token}`;
          }, 0);

        } else {
          Toastify({
                    text: "Registration Success ! Redirecting to checkout page failed. Please contact management for help",
                    duration: 5000,
                    close: true,
                    gravity: "top",
                    position: 'right', 
                    style: {
                        background: "red",
                    },
                    className: "info",
            }).showToast();
          console.log("No invoices found.");
        }
        loadingIndicator.style.display = "none";
      })
      .catch((error) => {
        console.error("Failed to fetch invoices", error);
        loadingIndicator.style.display = "none";
      });
  }

function attachStudentToCourse(
    studentId,
    courseId,
    token,
    price,
    username,
    password
  ) {
    fetch(`${baseUrl}Course/${courseId}/students/rel/${studentId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(() => {
        // Proceed with the original flow (non-San Diego only)
        // Suppose to get a new token upon registration, simulate login to get the real token
        simulateLogin(username, password, studentId, courseId, price);
      })
      .catch((error) => {
        console.error("Failed to attach student", error);
        alert("Failed to add student to course. Please try again.");
        loadingIndicator.style.display = "none";
      });
  }

  function simulateLogin(username, password, studentId, courseId, price) {
    fetch(`${baseUrl}Account/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
        password: password 
       }),
    })
      .then((response) => response.json())
      .then((data) => {
        // console.log("Login success", data);
        token = data.id; // Update the token with a real, newly acquired one
        fetchInvoices(studentId, courseId, price, token, true);
      })
      .catch((error) => {
        console.error("Login failed", error);
        alert("Login failed. Please try again.");
        loadingIndicator.style.display = "none";
      });
  }
});
