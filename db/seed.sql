-- Boshlang'ich test uchun 10 ta savol (5-sinf, Matematika, Kasrlar)

INSERT INTO teachers (full_name, login, password) VALUES
('Aliyeva Nodira', 'nodira', 'test123')
ON CONFLICT (login) DO NOTHING;

INSERT INTO questions (grade, subject, topic, question, option_a, option_b, option_c, option_d, correct_answer, difficulty, source_book, source_page) VALUES
(5, 'Matematika', 'Kasrlar', '3/4 + 1/2 = ?', '1', '5/4', '3/2', '7/8', 'B', 'medium', '5-sinf matematika', 124),
(5, 'Matematika', 'Kasrlar', '1/2 + 1/2 = ?', '1', '1/4', '2/2', '1/3', 'A', 'easy', '5-sinf matematika', 120),
(5, 'Matematika', 'Kasrlar', '2/3 ning maxraji nechaga teng?', '2', '3', '5', '6', 'B', 'easy', '5-sinf matematika', 118),
(5, 'Matematika', 'Kasrlar', '5/6 - 1/3 = ?', '1/2', '2/3', '1/3', '4/6', 'A', 'medium', '5-sinf matematika', 126),
(5, 'Matematika', 'Kasrlar', '3/8 ni o''nlik kasrga aylantiring', '0.375', '0.38', '0.3', '0.835', 'A', 'hard', '5-sinf matematika', 130),
(5, 'Matematika', 'Kasrlar', '2/5 + 3/5 = ?', '1', '5/10', '1/5', '6/5', 'A', 'easy', '5-sinf matematika', 121),
(5, 'Matematika', 'Kasrlar', '7/9 - 2/9 = ?', '5/9', '9/9', '5/18', '1', 'A', 'easy', '5-sinf matematika', 122),
(5, 'Matematika', 'Kasrlar', '1/4 ni 2/3 ga ko''paytiring', '2/12', '1/6', '3/8', '2/7', 'B', 'hard', '5-sinf matematika', 135),
(5, 'Matematika', 'Kasrlar', '4/5 ni 2 ga bo''ling', '2/5', '8/5', '4/10', '2/10', 'A', 'medium', '5-sinf matematika', 132),
(5, 'Matematika', 'Kasrlar', '1/3 va 1/4 dan qaysi biri katta?', '1/3', '1/4', 'Teng', 'Aniqlab bo''lmaydi', 'A', 'medium', '5-sinf matematika', 128);
