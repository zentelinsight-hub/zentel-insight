with seed_programs (
  slug,
  title,
  short_description,
  long_description,
  category,
  icon_name,
  featured,
  display_order
) as (
  values
    ('graphic-design', 'Graphic Design', 'Learn visual communication, brand assets, layout systems, and practical design workflows.', 'A practical design pathway for learners who want to create posters, social content, brand materials, and polished visual assets with confidence.', 'creative', 'pen-tool', true, 10),
    ('web-design-and-development', 'Web Design and Development', 'Build responsive websites with modern frontend foundations and deployment-ready habits.', 'Learners move from layout and styling fundamentals into real website structure, accessibility, responsive design, and publishing workflows.', 'technology', 'code', true, 20),
    ('software-development', 'Software Development', 'Develop problem-solving habits and software foundations for real application building.', 'A structured introduction to software thinking, application logic, versioning discipline, and practical development workflows.', 'technology', 'terminal', false, 30),
    ('video-editing', 'Video Editing', 'Create clear, engaging video stories for education, business, and social platforms.', 'A creative media pathway covering editing rhythm, story structure, audio, captions, exports, and practical project delivery.', 'creative', 'video', true, 40),
    ('python-programming', 'Python Programming', 'Use Python to understand programming logic, automation, and practical problem solving.', 'A hands-on Python pathway designed around readable code, exercises, small utilities, and confidence with programming fundamentals.', 'technology', 'braces', false, 50),
    ('digital-marketing', 'Digital Marketing', 'Understand audience, content, campaigns, and digital growth foundations.', 'A practical marketing pathway covering content planning, channel strategy, campaign basics, and measurement habits.', 'business', 'megaphone', true, 60),
    ('affiliate-marketing', 'Affiliate Marketing', 'Learn responsible affiliate marketing foundations, positioning, and conversion basics.', 'A focused introduction to affiliate models, audience fit, ethical promotion, content planning, and performance tracking.', 'business', 'network', false, 70),
    ('business-management', 'Business Management', 'Build practical business organization, planning, and management habits.', 'A practical pathway for understanding business structure, operations, customer thinking, and organized execution.', 'business', 'briefcase', false, 80),
    ('data-analysis', 'Data Analysis', 'Learn to organize, interpret, and present data for clearer decisions.', 'A practical data pathway covering data organization, analysis habits, reporting, and decision-ready presentation.', 'technology', 'chart', true, 90),
    ('ui-ux-design', 'UI/UX Design', 'Design usable digital interfaces with clear structure and user-centered thinking.', 'A design pathway covering interface structure, usability, flows, wireframes, prototypes, and practical critique.', 'creative', 'layout', false, 100),
    ('mobile-app-development', 'Mobile App Development', 'Explore app design, mobile interfaces, and practical application development foundations.', 'A pathway for learners interested in building mobile experiences, from interface planning to app logic and project structure.', 'technology', 'smartphone', false, 110),
    ('cybersecurity-basics', 'Cybersecurity Basics', 'Understand digital safety, secure habits, and beginner cybersecurity concepts.', 'A beginner-friendly pathway into safe digital behavior, security concepts, common risks, and responsible protection habits.', 'technology', 'shield', false, 120),
    ('virtual-assistance', 'Virtual Assistance', 'Learn practical remote support, organization, communication, and task-management skills.', 'A practical pathway for learners interested in administrative support, client communication, scheduling, and remote work systems.', 'business', 'users', false, 130),
    ('content-creation', 'Content Creation', 'Plan, create, and improve practical content for digital channels.', 'A creative pathway covering content planning, audience clarity, production basics, and consistent publishing habits.', 'creative', 'book-open', false, 140),
    ('cv-professional-portfolio-development', 'CV and Professional Portfolio Development', 'Improve your CV, online profile, and professional portfolio for opportunities.', 'A focused pathway for learners preparing for internships, freelance work, applications, or stronger professional visibility.', 'professional', 'briefcase', false, 150)
)
insert into public.programs (
  slug,
  title,
  short_description,
  long_description,
  category,
  icon_name,
  active,
  featured,
  display_order
)
select
  slug,
  title,
  short_description,
  long_description,
  category,
  icon_name,
  true,
  featured,
  display_order
from seed_programs
on conflict (slug) do update set
  title = excluded.title,
  short_description = excluded.short_description,
  long_description = excluded.long_description,
  category = excluded.category,
  icon_name = excluded.icon_name,
  active = excluded.active,
  featured = excluded.featured,
  display_order = excluded.display_order;

with seed_levels (
  program_slug,
  level_name,
  price_kobo,
  duration_text,
  level_description
) as (
  values
    ('graphic-design', 'Design Foundations', 1000000, 'Flexible cohort schedule', 'Core layout, colour, typography and visual-composition practice.'),
    ('graphic-design', 'Brand and Social Media Design', 2000000, 'Flexible cohort schedule', 'Practical brand assets and platform-ready creative content.'),
    ('graphic-design', 'Visual Identity and Professional Portfolio', 3500000, 'Flexible cohort schedule', 'Portfolio-focused identity systems and presentation work.'),
    ('web-design-and-development', 'Web Foundations', 2000000, 'Flexible cohort schedule', 'HTML, CSS, responsive layout and web publishing foundations.'),
    ('web-design-and-development', 'Frontend Development', 3500000, 'Flexible cohort schedule', 'JavaScript, accessibility, Git and interactive frontend practice.'),
    ('web-design-and-development', 'Full-Stack Web Applications', 5500000, 'Flexible cohort schedule', 'React, APIs, Supabase-backed data and deployment workflow.'),
    ('software-development', 'Programming Foundations', 2500000, 'Flexible cohort schedule', 'Programming logic, syntax, debugging and small exercises.'),
    ('software-development', 'Application Development', 4500000, 'Flexible cohort schedule', 'Data, APIs, project structure and application workflows.'),
    ('software-development', 'Software Engineering Practice', 7000000, 'Flexible cohort schedule', 'Testing, architecture, versioning and deployment readiness.'),
    ('video-editing', 'Video Editing Essentials', 1500000, 'Flexible cohort schedule', 'Timeline editing, clips, audio basics and clean exports.'),
    ('video-editing', 'Professional Editing and Storytelling', 2500000, 'Flexible cohort schedule', 'Narrative rhythm, captions, colour and platform-ready delivery.'),
    ('video-editing', 'Motion Graphics and Commercial Production', 4000000, 'Flexible cohort schedule', 'Motion elements and campaign-style video projects.'),
    ('python-programming', 'Python Foundations', 1800000, 'Flexible cohort schedule', 'Syntax, control flow, functions and beginner exercises.'),
    ('python-programming', 'Automation, Data and APIs', 3200000, 'Flexible cohort schedule', 'Useful scripts, files, data handling and API calls.'),
    ('python-programming', 'Python Application Development', 5000000, 'Flexible cohort schedule', 'Structured apps with Flask or FastAPI where appropriate.'),
    ('digital-marketing', 'Digital Marketing Foundations', 1800000, 'Flexible cohort schedule', 'Audience, channels, content planning and responsible marketing basics.'),
    ('digital-marketing', 'Campaigns, Content and Advertising', 3500000, 'Flexible cohort schedule', 'Campaign setup, ad planning, email and content workflows.'),
    ('digital-marketing', 'Analytics and Growth Strategy', 5500000, 'Flexible cohort schedule', 'Measurement, reporting and strategy improvement practice.'),
    ('affiliate-marketing', 'Affiliate Marketing Starter', 1200000, 'Flexible cohort schedule', 'Foundations, disclosure, audience fit and responsible promotion.'),
    ('affiliate-marketing', 'Campaign and Funnel Building', 2200000, 'Flexible cohort schedule', 'Content flow, landing pages, email basics and conversion planning.'),
    ('affiliate-marketing', 'Optimization and Ethical Scaling', 3500000, 'Flexible cohort schedule', 'Measurement, testing and responsible improvement habits.'),
    ('business-management', 'Business Essentials', 1500000, 'Flexible cohort schedule', 'Business structure, customers, offers and planning basics.'),
    ('business-management', 'Operations, Finance and Customer Management', 2500000, 'Flexible cohort schedule', 'Organizing work, tracking money and serving customers.'),
    ('business-management', 'Strategy, Leadership and Business Growth', 4000000, 'Flexible cohort schedule', 'Decision-making, team habits and growth planning.'),
    ('data-analysis', 'Excel Data Essentials', 2000000, 'Flexible cohort schedule', 'Spreadsheets, cleaning, formulas, charts and business reporting.'),
    ('data-analysis', 'SQL and Power BI Analysis', 4000000, 'Flexible cohort schedule', 'Querying data and building decision-ready dashboards.'),
    ('data-analysis', 'Python Analytics and Portfolio Projects', 6500000, 'Flexible cohort schedule', 'Python notebooks, analysis workflows and portfolio evidence.'),
    ('ui-ux-design', 'UX and Interface Foundations', 2000000, 'Flexible cohort schedule', 'User flows, layout, wireframes and usability basics.'),
    ('ui-ux-design', 'Product Design and Interactive Prototyping', 3500000, 'Flexible cohort schedule', 'Figma prototyping, product screens and critique practice.'),
    ('ui-ux-design', 'Design Systems and Professional Portfolio', 5500000, 'Flexible cohort schedule', 'Reusable components, documentation and portfolio presentation.'),
    ('mobile-app-development', 'Mobile Development Foundations', 2500000, 'Flexible cohort schedule', 'Dart basics, mobile UI and development setup.'),
    ('mobile-app-development', 'Cross-Platform Application Development', 4500000, 'Flexible cohort schedule', 'Flutter screens, navigation, state and local data.'),
    ('mobile-app-development', 'Production Apps, APIs and Deployment', 7000000, 'Flexible cohort schedule', 'API-backed app flows and release-readiness concepts.'),
    ('cybersecurity-basics', 'Cybersecurity Foundations', 2000000, 'Flexible cohort schedule', 'Digital safety, security concepts, ethics and defensive thinking.'),
    ('cybersecurity-basics', 'Network and Endpoint Security', 4000000, 'Flexible cohort schedule', 'Network basics, endpoint risks and authorized lab observation.'),
    ('cybersecurity-basics', 'Junior Security Analyst Track', 6500000, 'Flexible cohort schedule', 'Monitoring concepts, reporting and defensive workflow practice.'),
    ('virtual-assistance', 'Virtual Assistant Essentials', 1200000, 'Flexible cohort schedule', 'Communication, scheduling and remote-work foundations.'),
    ('virtual-assistance', 'Executive and Digital Operations', 2200000, 'Flexible cohort schedule', 'Client support, tools and organized digital workflows.'),
    ('virtual-assistance', 'Specialized Technical Virtual Assistance', 3500000, 'Flexible cohort schedule', 'Technical support workflows and service packaging.'),
    ('content-creation', 'Content Creation Foundations', 1200000, 'Flexible cohort schedule', 'Audience clarity, planning and basic content production.'),
    ('content-creation', 'Video and Social Content Production', 2200000, 'Flexible cohort schedule', 'Practical video, graphics and platform-ready publishing.'),
    ('content-creation', 'Content Strategy and Brand Growth', 3500000, 'Flexible cohort schedule', 'Content systems, analytics and brand consistency.'),
    ('cv-professional-portfolio-development', 'Career Starter Package', 1000000, 'Workshop format', 'CV structure, clearer wording and application-readiness basics.'),
    ('cv-professional-portfolio-development', 'Professional Branding Package', 1500000, 'Workshop format', 'CV, LinkedIn guidance and professional positioning.'),
    ('cv-professional-portfolio-development', 'Technology Portfolio Package', 2500000, 'Workshop format', 'Portfolio presentation, project framing and technology-profile polish.')
)
insert into public.program_levels (
  program_id,
  level_name,
  price_kobo,
  duration_text,
  level_description,
  active
)
select
  programs.id,
  seed_levels.level_name,
  seed_levels.price_kobo,
  seed_levels.duration_text,
  seed_levels.level_description,
  true
from seed_levels
join public.programs on programs.slug = seed_levels.program_slug
on conflict (program_id, level_name) do update set
  price_kobo = excluded.price_kobo,
  duration_text = excluded.duration_text,
  level_description = excluded.level_description,
  active = excluded.active;

insert into public.studyhub_subjects (class_group, name, display_order)
values
  ('JSS', 'Mathematics', 10),
  ('JSS', 'English Language', 20),
  ('JSS', 'Basic Science', 30),
  ('JSS', 'Basic Technology', 40),
  ('JSS', 'Business Studies', 50),
  ('SSS', 'Mathematics', 10),
  ('SSS', 'English Language', 20),
  ('SSS', 'Physics', 30),
  ('SSS', 'Chemistry', 40),
  ('SSS', 'Biology', 50),
  ('SSS', 'Economics', 60)
on conflict (class_group, name) do update set
  display_order = excluded.display_order,
  active = true;
