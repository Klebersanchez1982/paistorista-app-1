// js/main.js

// Importações do Firebase
const auth = firebase.auth();
const db = firebase.firestore();
let refreshTimerStarted = false;

// Função de logout (comum)
export async function logoutUser() {
  try {
    await auth.signOut();
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
    alert('⚠️ Erro ao sair: ' + error.message);
  }
}

// Função comum para mostrar/esconder loading
function showLoading(show) {
  const loading = document.getElementById('loading');
  const main = document.querySelector('main');
  if (loading && main) {
    loading.style.display = show ? 'block' : 'none';
    main.style.display = show ? 'none' : 'block';
  }
}

function waitForGoogleMaps(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      if (window.google && window.google.maps) {
        clearInterval(intervalId);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(intervalId);
        reject(new Error('Google Maps não carregou no tempo esperado.'));
      }
    }, 200);
  });
}

// Tempo limite para resposta (5 minutos em ms)
const REQUEST_TIMEOUT = 5 * 60 * 1000;

// Lógica geral: Espera auth state em todas as páginas protegidas
document.addEventListener('DOMContentLoaded', () => {
  showLoading(true);  // Mostra loading inicialmente
  if (window.M && typeof M.AutoInit === 'function') {
    M.AutoInit();  // Inicializa Materialize
  }

  auth.onAuthStateChanged(async user => {
    try {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }

      // Usuário logado: Carrega dados específicos da página
      if (window.location.pathname.endsWith('passageiro.html')) {
        await loadPassengerPage(user);
      } else if (window.location.pathname.endsWith('app.html')) {
        await loadDriverPage(user);
      }

      // Atualiza a página periodicamente (evita múltiplos timers)
      if (!refreshTimerStarted) {
        refreshTimerStarted = true;
        setInterval(() => {
          location.reload();
        }, 500000);
      }
    } catch (error) {
      console.error('Erro ao inicializar página:', error);
      alert('⚠️ Erro ao carregar a tela. Recarregue a página.\n\nDetalhe: ' + (error?.message || error));
    } finally {
      showLoading(false);  // Esconde loading mesmo em caso de erro
    }
  });
});

// Função para carregar página de passageiro
async function loadPassengerPage(user) {
  const schoolList = document.getElementById('school-list');
  const ridesList = document.getElementById('rides-list');
  const myRequests = document.getElementById('my-requests');

  // Listener em tempo real para caronas, para extrair escolas únicas
  db.collection('caronas').onSnapshot(snapshot => {
    const schools = new Set(); // Usar Set para nomes únicos de escolas
    snapshot.forEach(doc => {
      const ride = doc.data();
      if (ride.escola && ride.vagas > 0) {
        schools.add(ride.escola); // Adiciona nome da escola se houver vagas
      }
    });

    // Limpa e popula lista de escolas
    schoolList.innerHTML = '<li class="collection-header"><h6>Lista de Escolas</h6></li>';
    schools.forEach(schoolName => {
      const li = document.createElement('li');
      li.classList.add('collection-item');
      li.innerHTML = `
        <div>${schoolName} <span class="secondary-content"><i class="material-icons">school</i></span></div>
      `;
      li.addEventListener('click', () => loadRidesForSchool(schoolName));
      schoolList.appendChild(li);
    });
  });

  let unsubscribeRides; // Para cancelar listener anterior de caronas

  // Função para carregar e escutar caronas de uma escola específica em tempo real (por nome da escola)
  function loadRidesForSchool(schoolName) {
    if (unsubscribeRides) unsubscribeRides(); // Cancela listener anterior

    ridesList.innerHTML = '<li class="collection-header"><h6>Caronas para esta escola</h6></li>'; // Limpa lista

    unsubscribeRides = db.collection('caronas')
      .where('escola', '==', schoolName)
      .where('vagas', '>', 0)
      .onSnapshot(snapshot => {
        // Limpa itens existentes (exceto header)
        while (ridesList.children.length > 1) {
          ridesList.removeChild(ridesList.lastChild);
        }

        snapshot.forEach(doc => {
          const ride = doc.data();
          const li = document.createElement('li');
          li.classList.add('collection-item');
          li.innerHTML = `
            <div>Motorista: ${ride.motorista} | Vagas: ${ride.vagas} | Horário: ${ride.horario || 'Não especificado'}
              <a href="#!" class="secondary-content" onclick="requestRide('${doc.id}')"><i class="material-icons">add_circle</i></a>
            </div>
          `;
          ridesList.appendChild(li);
        });
      });
  }

  // Função para solicitar carona
  window.requestRide = async function(rideId) {
    try {
      const rideDoc = await db.collection('caronas').doc(rideId).get();
      if (!rideDoc.exists) throw "Carona não existe";
      const rideData = rideDoc.data();

      if (rideData.vagas <= 0) throw "Sem vagas disponíveis";

      // Adiciona solicitação
      await db.collection('solicitacoes').add({
        passageiroId: user.uid,
        passageiroNome: user.displayName,
        rideId,
        motoristaId: rideData.uid,
        motoristaNome: rideData.motorista,
        horario: rideData.horario,
        status: 'pendente',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      alert('✅ Solicitação enviada! Aguarde a resposta do motorista.');

      // Inicia timer para cancelamento automático (lógica no lado do servidor seria melhor, mas simulando aqui)
      setTimeout(async () => {
        const reqSnap = await db.collection('solicitacoes').where('rideId', '==', rideId).where('passageiroId', '==', user.uid).get();
        if (!reqSnap.empty) {
          const reqDoc = reqSnap.docs[0];
          if (reqDoc.data().status === 'pendente') {
            await reqDoc.ref.update({ status: 'cancelada' });
            alert('⚠️ Solicitação cancelada por falta de resposta.');
          }
        }
      }, REQUEST_TIMEOUT);
    } catch (error) {
      alert('⚠️ Erro ao solicitar: ' + error.message || error);
    }
  };

  // Listener em tempo real para minhas solicitações
  db.collection('solicitacoes')
    .where('passageiroId', '==', user.uid)
    .onSnapshot(snapshot => {
      myRequests.innerHTML = '<li class="collection-header"><h6>Solicitações realizadas</h6></li>'; // Limpa

      snapshot.forEach(doc => {
        const req = doc.data();
        const li = document.createElement('li');
        li.classList.add('collection-item');
        li.innerHTML = `Carona ID: ${req.rideId} | Motorista: ${req.motoristaNome || 'N/A'} | Status: ${req.status}`;
        if (req.status === 'aceita') {
          li.innerHTML += ` | Horário: ${req.horario || 'N/A'}`;
        }
        myRequests.appendChild(li);
      });
    });
}

// Função para carregar página de motorista
async function loadDriverPage(user) {
  let map, directionsService, directionsRenderer, geocoder, currentMarker;

  await waitForGoogleMaps();

  const mapElement = document.getElementById('map');
  if (!mapElement) {
    throw new Error('Elemento do mapa não encontrado.');
  }

  map = new google.maps.Map(mapElement, {
    zoom: 12,
    center: { lat: -23.5505, lng: -46.6333 } // Centro padrão (São Paulo)
  });
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer();
  directionsRenderer.setMap(map);
  geocoder = new google.maps.Geocoder(); // Inicializa o Geocoder

  // Botão para usar localização atual como origem
  document.getElementById('btn-location')?.addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        const latlng = new google.maps.LatLng(latitude, longitude);

        // Usa reverse geocoding para obter o endereço
        geocoder.geocode({ location: latlng }, (results, status) => {
          if (status === 'OK') {
            if (results[0]) {
              document.getElementById('origin').value = results[0].formatted_address;
              M.updateTextFields(); // Atualiza label do Materialize

              // Atualiza o mapa: centraliza e adiciona marcador
              map.setCenter(latlng);
              map.setZoom(15); // Aumenta o zoom para focar na localização

              // Remove marcador anterior se existir
              if (currentMarker) {
                currentMarker.setMap(null);
              }

              // Adiciona novo marcador
              currentMarker = new google.maps.Marker({
                position: latlng,
                map: map,
                title: 'Localização Atual'
              });
            } else {
              alert('⚠️ Nenhum resultado encontrado.');
            }
          } else {
            alert('⚠️ Erro no geocoding: ' + status);
          }
        });
      }, error => {
        alert('⚠️ Erro ao obter localização: ' + error.message);
      });
    } else {
      alert('⚠️ Geolocalização não suportada.');
    }
  });

  // Botão para traçar rota
  document.getElementById('btn-route')?.addEventListener('click', () => {
    const origin = document.getElementById('origin').value;
    const destination = document.getElementById('destination').value;
    if (!origin || !destination) {
      alert('⚠️ Preencha origem e destino.');
      return;
    }

    directionsService.route({
      origin,
      destination,
      travelMode: 'DRIVING'
    }, (response, status) => {
      if (status === 'OK') {
        directionsRenderer.setDirections(response);
      } else {
        alert('⚠️ Erro ao traçar rota: ' + status);
      }
    });
  });

  // Botão para salvar carona
  document.getElementById('btn-save')?.addEventListener('click', async () => {
    const school = document.getElementById('school').value;
    const seats = parseInt(document.getElementById('seats').value);
    const origin = document.getElementById('origin').value;
    const destination = document.getElementById('destination').value;
    const time = document.getElementById('time').value;

    if (!school || !seats || !origin || !destination || !time) {
      alert('⚠️ Preencha todos os campos.');
      return;
    }

    try {
      await db.collection('caronas').add({
        escola: school,
        motorista: user.displayName,
        uid: user.uid,
        vagas: seats,
        vagasDisponiveis: seats,
        origem: origin,
        destino: destination,
        horario: time,
        dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'ativa',
        solicitacoes: []
      });
      alert('✅ Carona salva com sucesso!');
      // Limpa formulário
      document.getElementById('school').value = '';
      document.getElementById('seats').value = '';
      document.getElementById('origin').value = '';
      document.getElementById('destination').value = '';
      document.getElementById('time').value = '';
      M.updateTextFields();
    } catch (error) {
      alert('⚠️ Erro ao salvar: ' + error.message);
    }
  });

  // Carregar minhas caronas
  const myRides = document.getElementById('my-rides');
  db.collection('caronas')
    .where('uid', '==', user.uid)
    .onSnapshot(snapshot => {
      myRides.innerHTML = '<li class="collection-header"><h6>Suas caronas cadastradas</h6></li>'; // Limpa

      snapshot.forEach(doc => {
        const ride = doc.data();
        const li = document.createElement('li');
        li.classList.add('collection-item');
        li.innerHTML = `Escola: ${ride.escola} | Vagas: ${ride.vagas} | Horário: ${ride.horario}`;
        myRides.appendChild(li);
      });
    });

  // Carregar solicitações pendentes
  const pendingRequests = document.getElementById('pending-requests');
  db.collection('solicitacoes')
    .where('motoristaId', '==', user.uid)
    .where('status', '==', 'pendente')
    .onSnapshot(snapshot => {
      pendingRequests.innerHTML = '<li class="collection-header"><h6>Solicitações para suas caronas</h6></li>'; // Limpa

      snapshot.forEach(doc => {
        const req = doc.data();
        const li = document.createElement('li');
        li.classList.add('collection-item');
        li.innerHTML = `Passageiro: ${req.passageiroNome} | Carona ID: ${req.rideId}
          <a href="#!" class="secondary-content" onclick="acceptRequest('${doc.id}', '${req.rideId}')"><i class="material-icons green-text">check</i></a>
          <a href="#!" class="secondary-content" onclick="rejectRequest('${doc.id}')"><i class="material-icons red-text">close</i></a>
        `;
        pendingRequests.appendChild(li);

        // Verifica timeout
        const timestamp = req.timestamp.toMillis();
        const elapsed = Date.now() - timestamp;
        if (elapsed > REQUEST_TIMEOUT) {
          doc.ref.update({ status: 'cancelada' });
        }
      });
    });
}

// Funções para aceitar/recusar solicitação
window.acceptRequest = async function(reqId, rideId) {
  try {
    const reqRef = db.collection('solicitacoes').doc(reqId);
    const rideRef = db.collection('caronas').doc(rideId);

    await db.runTransaction(async (transaction) => {
      const rideDoc = await transaction.get(rideRef);
      if (!rideDoc.exists) throw "Carona não existe";
      const newVagas = rideDoc.data().vagas - 1;
      if (newVagas < 0) throw "Sem vagas disponíveis";

      transaction.update(rideRef, { vagas: newVagas });
      transaction.update(reqRef, { status: 'aceita' });
    });

    alert('✅ Solicitação aceita!');
  } catch (error) {
    alert('⚠️ Erro ao aceitar: ' + error.message || error);
  }
};

window.rejectRequest = async function(reqId) {
  try {
    await db.collection('solicitacoes').doc(reqId).update({ status: 'recusada' });
    alert('✅ Solicitação recusada.');
  } catch (error) {
    alert('⚠️ Erro ao recusar: ' + error.message);
  }
};

// Listener de logout
document.getElementById('btn-logout')?.addEventListener('click', logoutUser);


