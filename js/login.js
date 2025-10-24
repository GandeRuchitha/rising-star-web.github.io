document.addEventListener("DOMContentLoaded", function () {
  const baseUrl = "https://backend4.sharemyworks.com/api/";
    //const baseUrl = 'http://localhost:3000/api/'
  var loginForm = document.getElementById("loginForm");
  var loadingIndicator = document.querySelector(".loading-indicator");

  var urlParams = new URLSearchParams(window.location.search);
  var courseId = urlParams.get("courseId");
  var accountId = urlParams.get("accountId");
  var token = urlParams.get("token");
  var price = urlParams.get("price");
  var chinese = window.location.href.includes("cn");
  var organizationId = urlParams.get("organizationId");
  
  const isSandiego = organizationId == "66bf6a0dcdae5300148e3a2c" || organizationId == "6713eacd00dcfc85b65c206a" || window.location.href.includes('/sandiego');
  const isIrvine = window.location.href.includes('/irvine');

  // Initialize Google auth if Irvine
  if (isIrvine) {
      initializeGoogleAuth();
      // render via safe helper
      if (window.renderGoogleButtonSafe) {
          window.renderGoogleButtonSafe('google-signin-button', {
              theme: 'outline',
              size: 'large',
              type: 'standard',
              text: 'continue_with',
              shape: 'rectangular',
              logo_alignment: 'left'
          });
      }
  }

    if (courseId) {
        populateCourseInfoCard(courseId, token);
    } else {
        // For trial users (no courseId), hide the course info card and show trial info instead
        const courseInfoCard = document.querySelector('.card.shadow-lg.mb-5');
        if (courseInfoCard && isSandiego) {
            courseInfoCard.innerHTML = `
                <div class="card-header bg-success text-white">
                    <h5 class="card-title mb-0">Trial Class Information</h5>
                </div>
                <div class="card-body text-start">
                    <div class="mb-3 row">
                        <div class="col-5 text-start">
                            <strong>Class Type:</strong>
                        </div>
                        <div class="col-7 text-start">
                            <span>Trial Class</span>
                        </div>
                    </div>
                    <div class="mb-3 row">
                        <div class="col-5 text-start">
                            <strong>Price:</strong>
                        </div>
                        <div class="col-7 text-start">
                            <span>$29</span>
                        </div>
                    </div>
                    <div class="mb-0 row">
                        <div class="col-12 text-start">
                            <small class="text-muted">Complete payment to secure your trial class spot</small>
                        </div>
                    </div>
                </div>
            `;
        } else if (courseInfoCard) {
            courseInfoCard.style.display = 'none';
        }
    }

    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        loadingIndicator.style.display = "block";

        try {
            var formData = new FormData(loginForm);
            var userInput = formData.get("userinput");
            var isEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(userInput);
            
            var postData = {
                password: formData.get("loginPassword")
            };
            
            if (isEmail) {
                postData.email = userInput;
            } else {
                postData.username = userInput;
            }
            const loginResponse = await fetch(`${baseUrl}Account/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(postData)
            });
            if (!loginResponse.ok) {
                throw new Error('Login failed');
            }
    
            const loginData = await loginResponse.json();
            var acc_token = token;
            token = loginData.id;
            accountId = loginData.userId;

            if (isSandiego) {
                // For San Diego, update account and link to course immediately
                console.log('San Diego login - processing account immediately');
                
                // Check if this is a trial participant (no courseId)
                const isTrialUser = !courseId;
                
                // For trial users, fetch their trial class information
                if (isTrialUser) {
                    try {
                        console.log('Fetching trial class information for account:', accountId);
                        const trialResponse = await fetch(`${baseUrl}TrialClasses/latest/${accountId}`);
                        
                        if (trialResponse.ok) {
                            const response = await trialResponse.json();
                            console.log('Trial class response:', response);
                            
                            // Extract the nested result for cleaner access
                            const { result } = response;
                            if (result?.success && result?.trialClass) {
                                console.log('Found trial class:', result.trialClass);
                                localStorage.setItem('trialClassId', result.trialClass.id);
                            } else {
                                console.log('No trial class found for this account');
                            }
                        } else if (trialResponse.status === 404) {
                            console.log('No trial class found for this account');
                            // Set flag to show error in modal
                            window.trialNotFound = true;
                        } else {
                            console.error('Failed to fetch trial class:', trialResponse.status);
                        }
                    } catch (error) {
                        console.error('Error fetching trial class information:', error);
                        // Continue anyway - not critical for login flow
                    }
                }
                
                try {
                    // Update account language preference directly (no course linking)
                    const updateResponse = await fetch(`${baseUrl}Account/${accountId}/?access_token=${token}`, {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify({ preferedLanguage: chinese ? "Chinese" : "English" })
                    });

                    if (!updateResponse.ok) {
                        console.error('Failed to update account preferences');
                        // Continue anyway - not critical
                    }
                    
                    // Handle course linking and payment history
                    if (courseId) {
                        let studentAlreadyLinked = false;
                        
                        if (courseId !== '1v1') {
                            // For San Diego: Check if student is already linked using new backend method
                            if (isSandiego) {
                                try {
                                    console.log('SD: Checking payment history for courseId:', courseId);
                                    const paymentCheckResponse = await fetch(`${baseUrl}Account/checkPaymentHistory?accountId=${accountId}&courseId=${courseId}`, {
                                        method: "GET",
                                        headers: {
                                            "Authorization": `Bearer ${token}`
                                        }
                                    });

                                    if (paymentCheckResponse.ok) {
                                        const paymentCheck = await paymentCheckResponse.json();
                                        console.log('SD: Payment check result:', paymentCheck);
                                        
                                        if (paymentCheck.result.found) {
                                            const existingPayment = paymentCheck.result.entry;
                                            console.log('SD: Found existing payment:', existingPayment);
                                            studentAlreadyLinked = true;
                                            
                                            if (existingPayment.status && existingPayment.status.includes('paid')) {
                                                console.log('SD: Student already paid for this course');
                                                
                                                // Clear localStorage before showing modal
                                                const itemsToRemove = ['trialClassId', 'registrationAccountId', 'registrationCourseId', 'registrationToken', 'formCompleted', 'pricingDetails', 'pendingRegistration', 'pendingLoginData', 'pendingSignupData'];
                                                itemsToRemove.forEach(item => {
                                                    if (localStorage.getItem(item)) {
                                                        localStorage.removeItem(item);
                                                    }
                                                });
                                                
                                                // Show message that they're already enrolled
                                                const modalTitle = document.querySelector('#confirmModal .modal-title');
                                                const modalBody = document.querySelector('#confirmModal .modal-body');
                                                const confirmButton = document.getElementById('confirmRedirect');
                                                
                                                modalTitle.textContent = 'Already Enrolled';
                                                modalBody.innerHTML = `
                                                    <div class="alert alert-info" role="alert">
                                                        <strong>You're already enrolled!</strong>
                                                    </div>
                                                    <p>You have already paid for and enrolled in this course.</p>
                                                    <p>If you need assistance, please contact us at (858) 588-7897.</p>
                                                `;
                                                confirmButton.textContent = 'Go to Course Schedule';
                                                
                                                const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
                                                confirmModal.show();
                                                
                                                if (confirmButton) {
                                                    const newButton = confirmButton.cloneNode(true);
                                                    confirmButton.parentNode.replaceChild(newButton, confirmButton);
                                                    
                                                    newButton.addEventListener('click', function() {
                                                        window.location.href = "/sandiego/schedule";
                                                    });
                                                }
                                                
                                                loadingIndicator.style.display = "none";
                                                return; // Exit early - don't proceed with payment flow
                                            } else {
                                                console.log('SD: Payment pending - skip course linking, redirect to pricing');
                                                studentAlreadyLinked = true; // Skip course linking and payment history creation
                                                
                                                // Store account info for payment processing  
                                                localStorage.setItem('registrationAccountId', accountId);
                                                localStorage.setItem('registrationCourseId', courseId || '');
                                                localStorage.setItem('registrationToken', token);
                                                
                                                loadingIndicator.style.display = "none";
                                                
                                                // Redirect directly to pricing page
                                                Toastify({
                                                    text: "Redirecting to complete your payment...",
                                                    duration: 1000,
                                                    close: true,
                                                    gravity: "top",
                                                    position: 'right',
                                                    style: {
                                                        background: "blue",
                                                    },
                                                    className: "info",
                                                }).showToast();

                                                setTimeout(() => {
                                                    window.location.href = "/sandiego/pricing";
                                                }, 500);
                                                
                                                return; // Exit early - don't proceed with normal flow
                                            }
                                        } else {
                                            console.log('SD: No existing payment found for this course');
                                        }
                                    }
                                } catch (error) {
                                    console.error('SD: Error checking payment history:', error);
                                    // Continue with normal flow if check fails
                                }
                            }
                            
                            // Link to regular course (only if not already linked)
                            if (!studentAlreadyLinked) {
                                console.log('Linking existing user to course:', courseId);
                                const courseResponse = await fetch(`${baseUrl}Course/${courseId}/students/rel/${accountId}`, {
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
                            } else {
                                console.log('SD: Student already linked to course, skipping link step');
                            }
                        }
                        
                        // Add payment history record for both regular and 1v1 courses
                        try {
                            const paymentData = {
                                accountId: accountId,
                                status: "payment_pending"
                            };
                            
                            if (isTrialUser) {
                                // For trial users, we'll get the trialClassId from the API we just called
                                const storedTrialClassId = localStorage.getItem('trialClassId');
                                if (storedTrialClassId) {
                                    paymentData.trialClassId = storedTrialClassId;
                                    paymentData.comment = "Trial class login - payment pending";
                                } else {
                                    paymentData.comment = "Trial class login - payment pending (no trial class ID found)";
                                }
                            } else if (courseId === '1v1') {
                                paymentData.comment = "1v1 - payment pending";
                            } else {
                                paymentData.courseId = courseId;
                                paymentData.comment = "Course login - payment pending";
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
                    localStorage.setItem('registrationAccountId', accountId);
                    localStorage.setItem('registrationCourseId', courseId || '');
                    localStorage.setItem('registrationToken', token);
                    
                    loadingIndicator.style.display = "none";
                    
                    // Update modal content based on user type
                    const modalTitle = document.querySelector('#confirmModal .modal-title');
                    const modalBody = document.querySelector('#confirmModal .modal-body');
                    const confirmButton = document.getElementById('confirmRedirect');
                    
                    if (isTrialUser && window.trialNotFound) {
                        modalTitle.textContent = 'No Trial Class Found';
                        modalBody.innerHTML = `
                            <div class="alert alert-warning" role="alert">
                                <strong>Trial class not found!</strong>
                            </div>
                            <p>We couldn't find a trial class registration for this email address.</p>
                            <p><strong>Next Step:</strong> Please fill out the trial form to register for a trial class.</p>
                        `;
                        confirmButton.textContent = 'Go to Trial Form';
                    } else if (isTrialUser) {
                        modalTitle.textContent = 'Welcome Back!';
                        modalBody.innerHTML = `
                            <div class="alert alert-success" role="alert">
                                Login successful! Welcome back to complete your trial class payment.
                            </div>
                            <p><strong>Next Step:</strong> You'll be redirected to the pricing page to complete your $29 trial class payment.</p>
                        `;
                        confirmButton.textContent = 'Continue to Trial Payment';
                    } else {
                        modalTitle.textContent = 'Login Successful';
                        modalBody.innerHTML = `
                            <div class="alert alert-success" role="alert">
                                Login successful!
                            </div>
                            <p class="text-warning"><strong>Important:</strong> Please note that the registration process is not complete until you complete the payment on the next page.</p>
                        `;
                        confirmButton.textContent = 'I Understand, Continue to Payment';
                    }
                    
                    const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
                    confirmModal.show();
                    
                    // Remove any existing event listeners and add new one
                    if (confirmButton) {
                        const newButton = confirmButton.cloneNode(true);
                        confirmButton.parentNode.replaceChild(newButton, confirmButton);
                        
                        newButton.addEventListener('click', function() {
                            if (isTrialUser && window.trialNotFound) {
                                // Redirect to trial form
                                Toastify({
                                    text: "Redirecting to trial form...",
                                    duration: 1000,
                                    close: true,
                                    gravity: "top",
                                    position: 'right',
                                    style: {
                                        background: "blue",
                                    },
                                    className: "info",
                                }).showToast();

                                confirmModal.hide();
                                setTimeout(() => {
                                    window.location.href = "/sandiego/schedule-trial";
                                }, 500);
                            } else {
                                // Normal flow
                                const toastMessage = isTrialUser ? 
                                    "Redirecting to complete your trial payment..." : 
                                    "Redirecting to pricing page...";
                                
                                Toastify({
                                    text: toastMessage,
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
                                
                                // Set pricing details for trial payment before redirect
                                if (isTrialUser) {
                                    const pricingDetails = {
                                        priceId: 'prod_QvBBSMzCIqf4YS', // SD Trial class product ID
                                        planName: 'SD Trial Class',
                                        amount: 2900, 
                                        proration: {
                                            proratedAmount: 29.00 + (29.00 * 0.035), // $29 + 3.5% processing fee
                                            processingFee: 29.00 * 0.035,
                                            monthlyPrice: 29.00,
                                            processingFeePercent: 3.5,
                                            daysRemaining: null,
                                            nextBillingDate: new Date(),
                                            type: 'processing_fee'
                                        },
                                        locationType: 'sandiego',
                                        calculationType: 'processing_fee'
                                    };
                                    localStorage.setItem('pricingDetails', JSON.stringify(pricingDetails));
                                    console.log('Trial pricing details set for payment page');
                                }
                                
                                setTimeout(() => {
                                    if (isTrialUser) {
                                        window.location.href = "/sandiego/payment_details";
                                    } else {
                                        window.location.href = "/sandiego/pricing";
                                    }
                                }, 500);
                            }
                        });
                    }
                    
                } catch (error) {
                    console.error('San Diego login processing failed:', error);
                    loadingIndicator.style.display = "none";
                    
                    // Show error message to user
                    Toastify({
                        text: "Login processing failed. Please try again or contact us at (858) 588-7897 for assistance.",
                        duration: 5000,
                        close: true,
                        gravity: "top",
                        position: 'right',
                        style: {
                            background: "red",
                        },
                        className: "info",
                    }).showToast();
                }
            } else {
                // Original flow for non-San Diego users
                await updateAccount({ preferedLanguage: chinese ? "Chinese" : "English" }, accountId, acc_token, token);
            }

        } catch (error) {
            console.error("Process failed", error);
            Toastify({
                text: "Login failed. Please check your credentials and try again. Username can be found in your email. Please contact management for help if you are unable to login.",
                duration: 5000,
                close: true,
                gravity: "top",
                position: 'right',
                style: {
                    background: "red",
                },
                className: "info",
            }).showToast();
            loadingIndicator.style.display = "none";
        }
    });

    function populateCourseInfoCard(courseId, token) {
        // For 1v1 private class, show TBD
        if (courseId === "1v1" && isSandiego) {
            document.getElementById("loginCourseName").innerText = "1v1 private class";
            // For San Diego: Hide dates and price elements
            const datesElement = document.getElementById("loginCourseDates");
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
                document.getElementById("loginCourseName").innerText = course.name;
                
                if (isSandiego) {
                    // For San Diego: Hide dates and price, only show course name
                    const datesElement = document.getElementById("loginCourseDates");
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
                    document.getElementById("loginCourseDates").innerText = 
                        course.dateStart.split("T")[0] + " - " + course.dateEnd.split("T")[0];
                    
                    const priceContainer = document.getElementById("priceContainer");
                    if (course.price && course.price !== 0) {
                        document.getElementById("loginCoursePrice").innerText = "$" + course.price;
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

    function updateAccount(data, accountId, access_token, token) {
        fetch(`${baseUrl}Account/${accountId}/?access_token=${token}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(() => {
            attachStudentToCourse(accountId, courseId, token, price);
        })
        .catch(error => {
            console.error("Update failed", error);
            alert("Update failed. Please try again.");
            loadingIndicator.style.display = "none";
        });
    }

    function attachStudentToCourse(accountId, courseId, token, price) {
        fetch(`${baseUrl}Course/${courseId}/students/rel/${accountId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
        .then(() => {
            if (isSandiego) {
                // Redirect to San Diego pricing page
                Toastify({
                    text: "Login Success! Redirecting to San Diego pricing page.",
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
                    window.location.href = "/sandiego/pricing";
                }, 0);
            } else {
                // Proceed with the original flow
                fetchInvoices(accountId, courseId, price, token);
            }
        })
        .catch(error => {
            console.error("Failed to attach student", error);
            alert("Failed to add student to course. Please try again.");
            loadingIndicator.style.display = "none";
        });
    }

    function fetchInvoices(accountId, courseId, price, token) {
        let filter = JSON.stringify({
            //where: { courseId: courseId },
            order: "date DESC",
            limit: 1
        });

        fetch(`${baseUrl}Account/${accountId}/invoices?access_token=${token}&filter=${encodeURIComponent(filter)}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
        .then(response => response.json())
        .then(invoices => {
            if (invoices.length > 0) {
                const invoice = invoices[0];
                Toastify({
                    text: "Login Success ! Redirecting to checkout page.",
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
                    window.location.href = `https://www.sharemyworks.com/checkout?invoiceId=${invoice.id}&courseId=${courseId}&studentId=${accountId}&amount=${invoice.amount}&token=${token}`;
                },0);
            } else {
                Toastify({
                    text: "Login Success ! Redirecting to checkout page failed. Please contact management for help",
                    duration: 5000,
                    close: true,
                    gravity: "top",
                    position: 'right', 
                    style: {
                        background: "red",
                    },
                    className: "info",
            }).showToast();
            }
            loadingIndicator.style.display = "none";
        })
        .catch(error => {
            console.error("Failed to fetch invoices", error);
            loadingIndicator.style.display = "none";
        });
    }


});
