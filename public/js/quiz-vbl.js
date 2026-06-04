// Seleção dos elementos do DOM
let quizWrp = document.querySelector(".quiz-box");
let quizBl = document.querySelector("#quiz");
let progBl = document.querySelector("#progress");
let resultBl = document.querySelector("#result");
let afterQuiz = document.querySelectorAll(".after-quiz");

let userName = "";
let userGender = "";
let userAge = "";
let currentWeight = 0;
let desiredWeight = 0;
let selectedBenefits = [];
let struggledMethods = [];

/**
 * Mostra a próxima pergunta, validando os dados conforme necessário.
 *
 * @param {number} currentQuestion - O número da pergunta atual.
 * @param {number} nextQuestion - O número da próxima pergunta.
 */
function showNextQuestion(currentQuestion, nextQuestion) {
  console.log("showNextQuestion chamada:", currentQuestion, nextQuestion);

  // Seleciona os elementos da pergunta atual e da próxima
  const currentQtn = document.querySelector(`#question${currentQuestion}`);
  const nextQtn = document.querySelector(`#question${nextQuestion}`);

  // Validações específicas de cada etapa
  if (currentQuestion === 1) {
    // Pergunta 1: Nome
    const nameInput = document.getElementById("name");
    userName = nameInput.value.trim();
    console.log("userName:", userName);
    if (!userName) {
      alert("Please enter your name.");
      return;
    }
  } else if (currentQuestion === 4) {
    // Pergunta 4: Peso atual
    // const currentWeightInput = document.getElementById("currentWeight");
    // currentWeight = parseFloat(currentWeightInput.value);
    // if (isNaN(currentWeight) || currentWeight <= 0) {
    //   alert("Please enter a valid current weight.");
    //   return;
    // }
    // Ao sair da pergunta 4 e ir para a pergunta 5, pré-preenche o range com o peso atual
    if (nextQuestion === 5) {
      const desiredWeightInput = document.getElementById("desiredWeight");
      const desiredWeightValueSpan = document.getElementById("desiredWeightValue");
      const currentWeightDisplaySpan = document.getElementById("currentWeightDisplay");
      if (desiredWeightInput) {
        // Define o valor máximo do slider como o peso atual
        desiredWeightInput.max = currentWeight;

        // Define o valor inicial do slider como o peso atual
        desiredWeightInput.value = currentWeight;

        // Força a atualização visual do slider
        desiredWeightInput.value = currentWeight; // Redefine o valor para garantir que o thumb seja atualizado

        // Atualiza o texto que exibe o valor do slider
        desiredWeightValueSpan.textContent = currentWeight;
      }

      if (currentWeightDisplaySpan) {
        // Exibe o peso atual na seção abaixo
        currentWeightDisplaySpan.textContent = currentWeight;
      }
    }
  } else if (currentQuestion === 5) {
    // Pergunta 5: Peso desejado
    // desiredWeight = parseFloat(document.getElementById("desiredWeight").value);
    // if (isNaN(desiredWeight) || desiredWeight <= 0) {
    //   alert("Please enter a valid desired weight.");
    //   return;
    // }
    // Validação removida: agora não se exige que o peso desejado seja menor que o peso atual.
  }

  // Esconde a pergunta atual e exibe a próxima (caso exista)
  currentQtn.classList.remove("active");
  if (nextQtn) {
    nextQtn.classList.add("active");
  }

  console.log("Pergunta", currentQuestion, "desativada.");
  console.log("Pergunta", nextQuestion, "ativada.");

  // Se a próxima "pergunta" for a etapa final (não existe pergunta 8), calcula o resultado
  if (nextQuestion === 8) {
    calculateResult();
    return;
  }
}

/**
 * Manipulador para o clique do botão "Next/Calculate".
 * Obtém os números da pergunta atual e a próxima a partir do atributo data-question.
 */
function nextQuestionHandler(event) {
  console.log("nextQuestionHandler chamada");
  // O botão possui data-question com o número da próxima pergunta.
  // Para identificar a pergunta atual, subtraímos 1.
  const nextQuestion = parseInt(event.target.dataset.question);
  // const currentQuestion = nextQuestion - 1;

  const currentQtn = event.target.closest('.question');
  const currentQuestion = parseInt(currentQtn.id.replace('question', ''));

  showNextQuestion(currentQuestion, nextQuestion);

  console.log("currentQuestion:", currentQuestion);
  console.log("nextQuestion:", nextQuestion);
  showNextQuestion(currentQuestion, nextQuestion);
}

// Função para mostrar a pergunta anterior
function showPreviousQuestion(currentQuestion, prevQuestion) {
  console.log("showPreviousQuestion chamada:", currentQuestion, prevQuestion);

  // Seleciona os elementos da pergunta atual e da anterior
  const currentQtn = document.querySelector(`#question${currentQuestion}`);
  const prevQtn = document.querySelector(`#question${prevQuestion}`);

  // Esconde a pergunta atual e exibe a anterior (caso exista)
  currentQtn.classList.remove("active");
  if (prevQtn) {
    prevQtn.classList.add("active");
  }

  console.log("Pergunta", currentQuestion, "desativada.");
  console.log("Pergunta", prevQuestion, "ativada.");
}

// Manipulador para o clique do botão "Voltar"
function previousQuestionHandler(event) {
  console.log("previousQuestionHandler chamada");
  // O botão possui data-question com o número da pergunta anterior.
  // Para identificar a pergunta atual, somamos 1.
  const prevQuestion = parseInt(event.target.dataset.question);
  const currentQuestion = prevQuestion + 1;

  console.log("currentQuestion:", currentQuestion);
  console.log("prevQuestion:", prevQuestion);
  showPreviousQuestion(currentQuestion, prevQuestion);
}

// Inicializa os eventos assim que o DOM estiver carregado
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOMContentLoaded event");

  // Adiciona o listener para os botões "next-button"
  const nextButtons = document.querySelectorAll(".next-button");
  nextButtons.forEach(button => {
    console.log("Adicionando ouvinte de evento ao botão:", button);
    button.addEventListener("click", nextQuestionHandler);
  });

  // Adiciona o listener para os botões "back-button"
  const backButtons = document.querySelectorAll(".back-button");
  backButtons.forEach(button => {
    button.addEventListener("click", previousQuestionHandler);
  });

  // Eventos para as opções (usadas nas perguntas 2 e 3)
  document.querySelectorAll(".option").forEach(option => {
    option.addEventListener("click", (event) => {
      const questionId = event.target.closest(".question").id;
      const value = event.target.dataset.value;

      if (questionId === "question2") {
        userGender = value;
        console.log("userGender:", userGender);
      } else if (questionId === "question3") {
        userAge = value;
        console.log("userAge:", userAge);
      }
    });
  });

  // Eventos para os checkboxes da pergunta 6 (benefícios desejados)
  // document.querySelectorAll("#question6 .form-check input").forEach(checkbox => {
  //   checkbox.addEventListener("change", (event) => {
  //     const benefit = event.target.id;
  //     if (event.target.checked) {
  //       selectedBenefits.push(benefit);
  //     } else {
  //       selectedBenefits = selectedBenefits.filter(b => b !== benefit);
  //     }
  //     console.log("selectedBenefits:", selectedBenefits);
  //   });
  // });

  // Eventos para os checkboxes da pergunta 7 (métodos já tentados)
  document.querySelectorAll("#question6 .form-check input").forEach(checkbox => {
    checkbox.addEventListener("change", (event) => {
      const method = event.target.id;
      if (event.target.checked) {
        struggledMethods.push(method);
      } else {
        struggledMethods = struggledMethods.filter(m => m !== method);
      }
      console.log("struggledMethods:", struggledMethods);
    });
  });

  // Atualiza o valor exibido do slider de peso desejado enquanto o usuário o movimenta
  const desiredWeightInput = document.getElementById("desiredWeight");
  desiredWeightInput.addEventListener("input", function () {
    document.getElementById("desiredWeightValue").textContent = this.value;
  });
});

/**
 * Função chamada ao final do quiz.
 * Aqui, o quiz é ocultado e o bloco de progresso é exibido.
 */
function calculateResult() {
  quizBl.style.display = "none";
  progBl.style.display = "block";
  console.log("Calculating result...");
  ProgressCountdown(10, 'count');
  // O TEMPO FICA NO CSS .bar-animation
}

// JavaScript
const progressBar = document.getElementById('progress-bar');
const fill = document.getElementById('fill');

const updateProgressBar = () => {
  /*const width = (remainingTime / totalTime) * 100; // Largura da barra = % do tempo restante
  fill.style.width = `${width}%`;*/
  fill.classList.add('bar-animation');
};
function ProgressCountdown(timeleft, text) {
  document.querySelector("#progress-steps").classList.add('running');
  return new Promise((resolve, reject) => {
    let countdownTimer = setInterval(() => {
      timeleft--;

      document.getElementById(text).textContent = timeleft;
      updateProgressBar()

      if (timeleft <= 0) {
        clearInterval(countdownTimer);
        resolve(true);
        document.querySelector("#name2").textContent = userName.split(" ")[0];
        progBl.style.display = 'none';
        resultBl.style.display = "block";
      }
    }, 1000);
  });
}

const unlockButton = document.getElementById('unlock-discount');

unlockButton.addEventListener('click', function () {
  // Esconde o quiz
  quizWrp.style.display = 'none';

  // Mostra os elementos após o quiz
  afterQuiz.forEach(e => {
    e.style.display = 'block';
  });

  // Faz o scroll suave até o elemento com id "firstPackage"
  $('html, body').animate({
    scrollTop: $('#scrolldown').offset().top
  }, 1000);
});



/* Limita 4 digitos */
// document.getElementById("currentWeight").addEventListener("input", function () {
//   let value = this.value;
//   if (value.length > 4) {
//     this.value = value.slice(0, 4);
//   }
// });

// Evento genérico para todas as opções
document.querySelectorAll(".option").forEach(option => {
  option.addEventListener("click", (event) => {
    const optionElement = event.target;
    const questionEl = optionElement.closest(".question");
    const currentQuestionId = questionEl.id;

    // Extrai o número da pergunta atual, ex: "question3" => 3
    const currentQuestion = parseInt(currentQuestionId.replace("question", ""));
    const nextQuestion = currentQuestion + 1;

    // Salva o valor selecionado (se necessário)
    const value = optionElement.dataset.value;
    if (currentQuestionId === "question2") {
      userGender = value;
      console.log("userGender:", userGender);
    } else if (currentQuestionId === "question3") {
      userAge = value;
      console.log("userAge:", userAge);
    }

    // Avança para a próxima pergunta automaticamente
    showNextQuestion(currentQuestion, nextQuestion);
  });
});
