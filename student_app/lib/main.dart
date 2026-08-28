import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

// Sizning Render backend manzilingiz:
const String BASE_URL = 'https://tester-ggjt.onrender.com/api';

void main() {
  runApp(const StudentApp());
}

class StudentApp extends StatelessWidget {
  const StudentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Test Platformasi',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.indigo,
        useMaterial3: true,
      ),
      home: const CodeInputScreen(),
    );
  }
}

class CodeInputScreen extends StatefulWidget {
  const CodeInputScreen({super.key});

  @override
  State<CodeInputScreen> createState() => _CodeInputScreenState();
}

class _CodeInputScreenState extends State<CodeInputScreen> {
  final _codeController = TextEditingController();
  final _nameController = TextEditingController();
  bool _isLoading = false;

  Future<void> _startTest() async {
    final code = _codeController.text.trim();
    final name = _nameController.text.trim();

    if (code.isEmpty || name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Iltimos, ismingiz va test kodini kiriting!')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      final response = await http.get(Uri.parse('$BASE_URL/tests/$code'));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        
        final attemptResponse = await http.post(
          Uri.parse('$BASE_URL/attempts/start'),
          headers: {'Content-Type': 'application/json'},
          body: json.encode({'test_code': code, 'student_name': name}),
        );

        if (attemptResponse.statusCode == 200 || attemptResponse.statusCode == 201) {
          final attemptData = json.decode(attemptResponse.body);
          
          if (!mounted) return;
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (context) => ExamScreen(
                attemptId: attemptData['attempt_id'],
                studentName: name,
                questions: data['questions'],
                durationMinutes: data['duration_minutes'] ?? 20,
              ),
            ),
          );
        } else {
          throw Exception('Sessiyani boshlab bo\'lmadi');
        }
      } else {
        throw Exception('Test topilmadi yoki kod xato!');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Xatolik: ${e.toString()}')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.quiz, size: 80, color: Colors.indigo),
              const SizedBox(height: 16),
              const Text('Test Platformasi', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
              const SizedBox(height: 32),
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Ism va Familiyangiz',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.person),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: '6 xonali Test kodi',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.numbers),
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _isLoading ? null : _startTest,
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size.fromHeight(50),
                  backgroundColor: Colors.indigo,
                  foregroundColor: Colors.white,
                ),
                child: _isLoading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text('Testni boshlash', style: TextStyle(fontSize: 18)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ExamScreen extends StatefulWidget {
  final int attemptId;
  final String studentName;
  final List questions;
  final int durationMinutes;

  const ExamScreen({
    super.key,
    required this.attemptId,
    required this.studentName,
    required this.questions,
    required this.durationMinutes,
  });

  @override
  State<ExamScreen> createState() => _ExamScreenState();
}

class _ExamScreenState extends State<ExamScreen> {
  int _currentIndex = 0;
  final Map<int, String> _userAnswers = {};
  late Timer _timer;
  late int _secondsRemaining;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _secondsRemaining = widget.durationMinutes * 60;
    _startTimer();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_secondsRemaining > 0) {
        setState(() => _secondsRemaining--);
      } else {
        _timer.cancel();
        _submitExam();
      }
    });
  }

  Future<void> _submitExam() async {
    _timer.cancel();
    setState(() => _isSubmitting = true);

    List answersPayload = _userAnswers.entries.map((e) => {
      'question_id': e.key,
      'selected_option': e.value
    }).toList();

    try {
      final response = await http.post(
        Uri.parse('$BASE_URL/attempts/submit'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'attempt_id': widget.attemptId,
          'answers': answersPayload,
        }),
      );

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => ResultScreen(result: result),
          ),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Topshirishda xatolik: ${e.toString()}')),
      );
    } finally {
      setState(() => _isSubmitting = false);
    }
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final currentQ = widget.questions[_currentIndex];
    final minutes = (_secondsRemaining ~/ 60).toString().padLeft(2, '0');
    final seconds = (_secondsRemaining % 60).toString().padLeft(2, '0');

    return Scaffold(
      appBar: AppBar(
        title: Text('Savol ${_currentIndex + 1}/${widget.questions.length}'),
        actions: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Center(
              child: Text(
                '$minutes:$seconds',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.red),
              ),
            ),
          )
        ],
      ),
      body: _isSubmitting
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Text(
                    currentQ['question_text'] ?? '',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 20),
                  ...['A', 'B', 'C', 'D'].map((optionKey) {
                    final optionText = currentQ['option_$optionKey'];
                    if (optionText == null) return const SizedBox.shrink();

                    final isSelected = _userAnswers[currentQ['id']] == optionKey;
                    return Card(
                      color: isSelected ? Colors.indigo.shade100 : Colors.white,
                      child: ListTile(
                        title: Text('$optionKey) $optionText'),
                        onTap: () {
                          setState(() {
                            _userAnswers[currentQ['id']] = optionKey;
                          });
                        },
                      ),
                    );
                  }).toList(),
                  const Spacer(),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      if (_currentIndex > 0)
                        ElevatedButton(
                          onPressed: () => setState(() => _currentIndex--),
                          child: const Text('Oldingisi'),
                        )
                      else
                        const SizedBox.shrink(),
                      if (_currentIndex < widget.questions.length - 1)
                        ElevatedButton(
                          onPressed: () => setState(() => _currentIndex++),
                          child: const Text('Keyingisi'),
                        )
                      else
                        ElevatedButton(
                          onPressed: _submitExam,
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.green, foregroundColor: Colors.white),
                          child: const Text('Tugatish'),
                        ),
                    ],
                  )
                ],
              ),
            ),
    );
  }
}

class ResultScreen extends StatelessWidget {
  final Map result;

  const ResultScreen({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    final score = result['score'] ?? 0;
    final total = result['total_questions'] ?? 0;
    final percentage = result['percentage'] ?? 0;

    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                percentage >= 60 ? Icons.check_circle : Icons.cancel,
                size: 100,
                color: percentage >= 60 ? Colors.green : Colors.red,
              ),
              const SizedBox(height: 20),
              const Text('Test Yakunlandi!', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 20),
              Text('To\'g\'ri javoblar: $score / $total', style: const TextStyle(fontSize: 18)),
              const SizedBox(height: 10),
              Text('Natija: $percentage%', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.indigo)),
              const SizedBox(height: 40),
              ElevatedButton(
                onPressed: () {
                  Navigator.pushReplacement(
                    context,
                    MaterialPageRoute(builder: (context) => const CodeInputScreen()),
                  );
                },
                child: const Text('Bosh sahifaga qaytish'),
              )
            ],
          ),
        ),
      ),
    );
  }
}
